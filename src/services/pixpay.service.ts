import { BrowserManager } from '../browser/BrowserManager';
import { logger } from '../utils/logger';
import { Page } from 'playwright';

export interface PaymentInputs {
  userId: string;
  paymentMethod: string;
  amount: string;
}

export interface PaymentResult {
  userId: string;
  paymentLink: string;
  status: string;
}

export class PixPayService {
  private browserManager: BrowserManager;

  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }

  async initialize(): Promise<void> {
    logger.info('[PixPayService] Initializing service...');
    await this.browserManager.initialize();
  }

  async shutdown(): Promise<void> {
    logger.info('[PixPayService] Shutting down service...');
    await this.browserManager.shutdown();
  }

  async refresh(): Promise<void> {
    logger.info('[PixPayService] Refreshing browser page...');
    await this.browserManager.refresh();
  }

  async checkLogin(): Promise<boolean> {
    logger.info('[PixPayService] Checking login session state...');
    return this.browserManager.isHealthy();
  }

  async createPayment(inputs: PaymentInputs): Promise<PaymentResult> {
    const totalStart = Date.now();
    logger.info(`[PixPayService] Starting payment creation for user: ${inputs.userId}`);
    
    const queueStart = Date.now();
    const page = await this.browserManager.acquirePage();
    const queueDuration = Date.now() - queueStart;

    const context = this.browserManager.getContext();

    if (!context) {
      this.browserManager.releasePage();
      throw new Error('Browser context not available');
    }

    const browserStart = Date.now();
    try {
      // Ensure we're on the Pay In page before starting
      await this.browserManager.ensurePayInPage();

      // Execute migrated payment creation logic (identical to the old codebase)
      const result = await this.executePaymentCreationFlow(page, context, inputs);
      
      const browserDuration = Date.now() - browserStart;
      const totalDuration = Date.now() - totalStart;

      logger.info(`[PixPayService] Payment creation metrics: QueueTime=${queueDuration}ms | BrowserTime=${browserDuration}ms | TotalTime=${totalDuration}ms`);

      return {
        ...result,
        queueDurationMs: queueDuration,
        browserDurationMs: browserDuration,
        totalDurationMs: totalDuration
      } as any;
    } finally {
      // Release page back to the BrowserManager queue
      this.browserManager.releasePage();
    }
  }

  // Maps Olympus payment method names to PixPay Pay In UI radio label text.
  // Olympus sends its own display names (e.g. "Lightning BTC"), but the PixPay
  // cashier form uses different label text in its radio buttons.
  private static readonly PAYMENT_METHOD_MAP: Record<string, string> = {
    'CashApp':       'CashApp',
    'Apple Pay':     'ApplePay',
    'Google Pay':    'GooglePay',
    'Chime':         'Chime',
    'BTC':           'BtcPay',
    'Lightning BTC': 'BtcPay',
    'Debit Card':    'Debit Card',
  };

  private resolvePixPayMethod(olympusMethod: string): string {
    const mapped = PixPayService.PAYMENT_METHOD_MAP[olympusMethod];
    if (!mapped) {
      throw new Error(
        `Unsupported payment method received from Olympus: "${olympusMethod}". ` +
        `Supported methods: ${Object.keys(PixPayService.PAYMENT_METHOD_MAP).join(', ')}`
      );
    }
    return mapped;
  }

  private async executePaymentCreationFlow(page: Page, context: any, inputs: PaymentInputs): Promise<PaymentResult> {
    // Resolve the PixPay-side method name before any browser interaction
    const pixpayMethod = this.resolvePixPayMethod(inputs.paymentMethod);

    const INPUTS = {
      userId: inputs.userId,
      paymentMethod: inputs.paymentMethod,
      amount: inputs.amount
    };

    logger.info(`[PixPayService] Payment method mapping: Olympus="${INPUTS.paymentMethod}" -> PixPay="${pixpayMethod}"`);

    // --- Step 1: Open Add Payment form ---
    logger.info('[PixPayService] Locating the "Add" button...');
    const addButton = page.locator('button:has-text("Add"), button:has-text("add"), .el-button:has-text("Add")').first();
    await addButton.waitFor({ state: 'visible', timeout: 15000 });
    logger.info('[PixPayService] Clicking the "Add" button...');
    await addButton.click();
    
    logger.info('[PixPayService] Waiting for the Add Payment form to open...');
    const dialog = page.locator('.el-dialog, form, [role="dialog"]').first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    
    const formDialog = page.locator('.el-dialog, [role="dialog"]').filter({ hasText: 'Add' }).first();
    await formDialog.waitFor({ state: 'visible', timeout: 15000 });

    // --- Step 2: Fill form fields ---
    logger.info('[PixPayService] Filling form fields inside dialog...');

    // --- Step 2a: Select Payment Method (Pay Way) ---
    logger.info(`[PixPayService] Selecting Pay Way radio -> "${pixpayMethod}"...`);

    // Find and click the target payment method radio
    const payWayRadio = formDialog.locator('label.el-radio').filter({ hasText: pixpayMethod }).first();
    await payWayRadio.waitFor({ state: 'visible', timeout: 5000 });
    await payWayRadio.click({ force: true });

    // Verify the correct radio is now selected (has 'is-checked' class in Element UI)
    const selectedRadio = formDialog.locator('label.el-radio.is-checked');
    const selectedCount = await selectedRadio.count();
    if (selectedCount === 0) {
      const availableOptions = await formDialog.locator('label.el-radio').allInnerTexts().catch(() => []);
      throw new Error(
        `Payment method selection verification failed: No radio button has "is-checked" class after clicking "${pixpayMethod}". ` +
        `Available options: [${availableOptions.join(' | ')}]`
      );
    }
    const selectedText = (await selectedRadio.first().innerText()).trim();
    logger.info(`[PixPayService] Verification: Currently selected Pay Way radio text = "${selectedText}"`);

    if (!selectedText.includes(pixpayMethod)) {
      const availableOptions = await formDialog.locator('label.el-radio').allInnerTexts().catch(() => []);
      throw new Error(
        `Payment method selection mismatch! Requested="${pixpayMethod}" but selected="${selectedText}". ` +
        `Aborting payment creation to prevent wrong method. Available options: [${availableOptions.join(' | ')}]`
      );
    }
    logger.info(`[PixPayService] Pay Way selection CONFIRMED: "${pixpayMethod}" is selected.`);

    try {
      logger.info(`[PixPayService] Filling User ID with: ${INPUTS.userId}...`);
      const userIdInput = formDialog.locator('input[placeholder="Please enter User ID"]').first();
      await userIdInput.fill(INPUTS.userId);
    } catch (e) {
      logger.warn('[PixPayService] Failed to fill User ID:', e);
    }

    try {
      logger.info(`[PixPayService] Selecting Amount -> ${INPUTS.amount} preset (Radio)...`);
      const amountRegex = new RegExp('^' + INPUTS.amount.replace('.', '\\.') + '$');
      const amountRadio = formDialog.locator('label.el-radio').filter({ hasText: amountRegex }).first();
      await amountRadio.waitFor({ state: 'visible', timeout: 5000 });
      await amountRadio.click({ force: true });
    } catch (e) {
      logger.warn(`[PixPayService] Failed to select Amount preset ${INPUTS.amount}:`, e);
    }

    // --- Step 3: Submit form ---
    logger.info('[PixPayService] Submitting the form by clicking "Yes"...');
    const yesButton = formDialog.locator('button:has-text("Yes"), .el-dialog__footer button:has-text("Yes")').first();
    await yesButton.waitFor({ state: 'visible', timeout: 5000 });
    await yesButton.click({ force: true });

    // --- Step 4: Confirm ---
    logger.info('[PixPayService] Waiting for the confirmation messagebox dialog to appear...');
    const messagebox = page.locator('.el-overlay, .el-message-box').filter({ hasText: 'Confirm' }).last();
    await messagebox.waitFor({ state: 'visible', timeout: 10000 });
    
    const confirmBtn = messagebox.locator('button:has-text("Confirm"), button.el-button--primary').first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    logger.info('[PixPayService] Clicking the "Confirm" button...');
    await confirmBtn.click({ force: true });

    // --- Step 5: Locate Created Payment Row & Extract Link ---
    logger.info(`[PixPayService] Locating payment row for User ID: ${INPUTS.userId}...`);
    const tableRows = page.locator('.el-table__body tbody .el-table__row');
    const targetRow = tableRows.filter({ hasText: INPUTS.userId }).first();

    // Fast resolution: check if newly inserted row is directly visible in table
    let isRowFound = await targetRow.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);

    // Fallback resolution: if table hasn't updated yet, search explicitly by User ID
    if (!isRowFound) {
      logger.info(`[PixPayService] Fast row locator pending. Performing explicit search for User ID: ${INPUTS.userId}...`);
      const searchInput = page.locator('input[placeholder="Please enter User ID"]').first();
      await searchInput.fill(INPUTS.userId).catch(() => {});

      const searchButton = page.locator('button.el-button--primary:has-text("Search")').first();
      await searchButton.click({ force: true }).catch(() => {});
      
      isRowFound = await targetRow.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    }

    if (!isRowFound) {
      throw new Error(`Row validation failed: Expected matching row for ${INPUTS.userId} but found none.`);
    }

    const matchingRow = targetRow;
    const directLinkEl = matchingRow.locator('a[href*="http"], span:has-text("http"), div:has-text("http")').first();
    let extractedLink = '';
    
    if (await directLinkEl.isVisible()) {
      const text = await directLinkEl.innerText();
      const href = await directLinkEl.getAttribute('href');
      extractedLink = (href || text).trim();
    } else {
      const copyButton = matchingRow.locator('button:has-text("Copy"), button:has-text("link"), button:has-text("Url"), .el-button:has-text("Copy")').first();
      if (await copyButton.isVisible()) {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await copyButton.click();
        await page.waitForTimeout(400);
        extractedLink = await page.evaluate(() => (globalThis as any).navigator.clipboard.readText());
      } else {
        const cells = await matchingRow.locator('td').all();
        for (let idx = 0; idx < cells.length; idx++) {
          const cellText = await cells[idx].innerText();
          if (cellText.startsWith('http')) {
            extractedLink = cellText.trim();
            break;
          }
        }
      }
    }

    if (!extractedLink || !extractedLink.startsWith('http')) {
      throw new Error('Could not extract a valid payment link from the matching row.');
    }

    return {
      userId: INPUTS.userId,
      paymentLink: extractedLink,
      status: 'Created'
    };
  }
}
