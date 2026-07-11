import { chromium, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import { logger } from '../utils/logger';

export type BrowserState = 'starting' | 'ready' | 'busy' | 'refreshing' | 'restarting' | 'error' | 'login-required';

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_DELAY_MS = 2000;
const IDLE_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class BrowserManager {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: BrowserState = 'starting';
  private restartAttempts = 0;
  private userDataDir: string;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshPending = false;
  private readyResolvers: Array<() => void> = [];
  private startupTime: number | null = null;
  private lastRefreshTime: number | null = null;

  // Queuing System
  private queue: Array<{
    resolve: (page: Page) => void;
    reject: (err: Error) => void;
  }> = [];
  private isPageBusy = false;

  constructor() {
    this.userDataDir = path.join(__dirname, '..', '..', 'browser-profile');
  }

  getState(): BrowserState {
    return this.state;
  }

  getPage(): Page | null {
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  isHealthy(): boolean {
    return this.state !== 'error' && this.state !== 'login-required' && this.page !== null;
  }

  setState(state: BrowserState): void {
    const prev = this.state;
    this.state = state;
    logger.info(`[BrowserManager] State changed from ${prev} to ${state}`);

    if (state === 'ready') {
      this.startRefreshTimer();
      
      // Resolve any waiters blocked on waitForReady()
      const resolvers = this.readyResolvers.splice(0);
      for (const resolve of resolvers) resolve();

      if (this.refreshPending) {
        this.refreshPending = false;
        this.refresh();
      }
    } else {
      this.stopRefreshTimer();
    }
  }

  waitForReady(): Promise<void> {
    if (this.state === 'ready') return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.readyResolvers.push(resolve);
    });
  }

  // --- Queue Methods ---
  async acquirePage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Browser is not initialized');
    }

    if (!this.isPageBusy) {
      this.isPageBusy = true;
      this.setState('busy');
      return this.page;
    }

    logger.info('[BrowserManager] Browser is currently busy. Queueing request...');
    return new Promise<Page>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  releasePage(): void {
    this.isPageBusy = false;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next && this.page) {
        logger.info(`[BrowserManager] Dequeueing next request. Remaining in queue: ${this.queue.length}`);
        this.isPageBusy = true;
        this.setState('busy');
        next.resolve(this.page);
      }
    } else {
      this.setState('ready');
    }
  }

  // --- Initialize & Launch ---
  async initialize(): Promise<void> {
    this.setState('starting');
    try {
      await this.launchBrowser();
      await this.navigateToPayIn();
      this.restartAttempts = 0;
      this.refreshPending = false;
      this.setState('ready');
    } catch (err) {
      logger.error('[BrowserManager] Initialization failed:', err);
      this.setState('error');
      throw err;
    }
  }

  private async launchBrowser(): Promise<void> {
    logger.info(`[BrowserManager] Launching persistent Chromium context at: ${this.userDataDir}`);

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized'
      ],
      viewport: null
    });

    this.context.setDefaultNavigationTimeout(60000);
    this.context.setDefaultTimeout(60000);
    this.startupTime = Date.now();

    // Setup context close listener (context crash recovery)
    this.context.on('close', () => {
      logger.error('[BrowserManager] Browser context closed unexpectedly. Recreating context...');
      this.handleContextCrash();
    });

    await this.createNewPage();
    logger.info('[BrowserManager] Chromium launched successfully.');
  }

  private async createNewPage(): Promise<void> {
    if (!this.context) throw new Error('No context available');
    
    this.page = await this.context.newPage();

    // Setup page crash listener (page crash recovery)
    this.page.on('crash', () => {
      logger.error('[BrowserManager] Page crashed. Recreating page...');
      this.handlePageCrash();
    });
  }

  private async navigateToPayIn(): Promise<void> {
    if (!this.page) throw new Error('No page available');

    logger.info('[BrowserManager] Navigating directly to Pay In page...');
    await this.page.goto('https://www.pixpaymentpro.com/#/glo/payin', {
      waitUntil: 'load'
    });

    await this.page.waitForTimeout(1500);
    const currentUrl = this.page.url();
    logger.info(`[BrowserManager] Current page URL is: ${currentUrl}`);

    if (currentUrl.includes('/payin')) {
      logger.info('[BrowserManager] SUCCESS: Authentication session is valid!');
      const payInTable = this.page.locator('.el-table, table').first();
      await payInTable.waitFor({ state: 'visible', timeout: 15000 });

      await Promise.race([
        this.page.locator('.el-table__body tbody .el-table__row').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
        this.page.locator('.el-table__empty-text').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      ]);
      logger.info('[BrowserManager] Pay In page is fully loaded and ready.');
    } else if (currentUrl.includes('/#/login')) {
      this.setState('login-required');
      throw new Error('Manual authentication required.');
    } else {
      throw new Error(`Unknown page state. URL: ${currentUrl}`);
    }
  }

  async ensurePayInPage(): Promise<void> {
    if (!this.page) throw new Error('No page available');

    const currentUrl = this.page.url();
    if (!currentUrl.includes('/payin')) {
      logger.info('[BrowserManager] Page is not on Pay In. Navigating back...');
      await this.navigateToPayIn();
    }
  }

  // --- Recovery Operations ---
  private async handlePageCrash(): Promise<void> {
    if (this.state === 'restarting') return;
    this.setState('restarting');
    
    try {
      if (this.page) {
        try { await this.page.close(); } catch (e) {}
      }
      await this.createNewPage();
      await this.navigateToPayIn();
      this.setState('ready');
      logger.info('[BrowserManager] Page recreation successful.');
    } catch (err) {
      logger.error('[BrowserManager] Page recovery failed. Attempting full context recovery...', err);
      await this.handleContextCrash();
    }
  }

  private async handleContextCrash(): Promise<void> {
    if (this.state === 'restarting') return;
    
    this.restartAttempts++;
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      logger.error(`[BrowserManager] Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded. Entering error state.`);
      this.setState('error');
      
      // Reject all pending queued requests
      const queued = this.queue.splice(0);
      for (const req of queued) {
        req.reject(new Error('Browser Manager entered fatal error state. Recovery failed.'));
      }
      return;
    }

    logger.info(`[BrowserManager] Attempting context restart (${this.restartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
    this.setState('restarting');

    try {
      if (this.context) {
        this.context.removeAllListeners('close');
        await this.context.close().catch(() => {});
      }
    } catch (e) {}

    this.context = null;
    this.page = null;

    await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS));

    try {
      await this.launchBrowser();
      await this.navigateToPayIn();
      this.restartAttempts = 0;
      this.setState('ready');
      logger.info('[BrowserManager] Context restart successful.');
    } catch (err) {
      logger.error('[BrowserManager] Context restart failed:', err);
      this.setState('error');
    }
  }

  async restart(): Promise<void> {
    logger.info('[BrowserManager] Manual restart requested.');
    await this.handleContextCrash();
  }

  // --- Idle Refresh ---
  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    this.refreshTimer = setInterval(() => {
      this.onRefreshTick();
    }, IDLE_REFRESH_INTERVAL_MS);
    logger.info(`[BrowserManager] Idle refresh timer started (every ${IDLE_REFRESH_INTERVAL_MS / 1000}s).`);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private onRefreshTick(): void {
    if (this.state === 'ready') {
      logger.info('[BrowserManager] Idle refresh timer fired. Browser is idle — refreshing now.');
      this.refresh();
    } else if (this.state === 'busy') {
      logger.info('[BrowserManager] Idle refresh timer fired. Browser is busy — deferring refresh.');
      this.refreshPending = true;
    }
  }

  async refresh(): Promise<void> {
    if (!this.page) {
      logger.warn('[BrowserManager] Cannot refresh — no page available.');
      return;
    }

    this.setState('refreshing');
    logger.info('[BrowserManager] Refreshing warm Pay In page...');

    try {
      await this.page.reload({ waitUntil: 'load' });
      await this.page.waitForTimeout(1500);

      const currentUrl = this.page.url();
      if (!currentUrl.includes('/payin')) {
        logger.warn(`[BrowserManager] After refresh, URL is unexpected: ${currentUrl}. Navigating back to Pay In.`);
        await this.navigateToPayIn();
      } else {
        const payInTable = this.page.locator('.el-table, table').first();
        await payInTable.waitFor({ state: 'visible', timeout: 15000 });

        await Promise.race([
          this.page.locator('.el-table__body tbody .el-table__row').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
          this.page.locator('.el-table__empty-text').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
        ]);
        logger.info('[BrowserManager] Refresh complete. Page is ready.');
      }
      this.lastRefreshTime = Date.now();
      this.setState('ready');
    } catch (err) {
      logger.error('[BrowserManager] Refresh failed:', err);
      try {
        await this.navigateToPayIn();
        this.lastRefreshTime = Date.now();
        this.setState('ready');
      } catch (navErr) {
        logger.error('[BrowserManager] Refresh recovery navigation failed:', navErr);
        this.setState('error');
      }
    }
  }

  // --- Shutdown ---
  async shutdown(): Promise<void> {
    logger.info('[BrowserManager] Shutting down...');
    this.stopRefreshTimer();
    this.refreshPending = false;
    
    // Reject all queued requests
    const queued = this.queue.splice(0);
    for (const req of queued) {
      req.reject(new Error('Browser Manager is shutting down.'));
    }

    try {
      if (this.context) {
        this.context.removeAllListeners('close');
        await this.context.close();
      }
    } catch (e) {}

    this.context = null;
    this.page = null;
    this.state = 'starting';
    logger.info('[BrowserManager] Shutdown complete.');
  }

  getUptime(): number {
    return this.startupTime ? Math.floor((Date.now() - this.startupTime) / 1000) : 0;
  }

  getLastRefresh(): string | null {
    return this.lastRefreshTime ? new Date(this.lastRefreshTime).toISOString() : null;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
