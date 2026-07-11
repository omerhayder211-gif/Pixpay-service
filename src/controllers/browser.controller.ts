import { Request, Response } from 'express';
import { browserManager } from '../utils/instances';
import { logger } from '../utils/logger';

export const getBrowserStatus = (req: Request, res: Response): void => {
  try {
    const page = browserManager.getPage();
    const context = browserManager.getContext();

    res.status(200).json({
      browserRunning: browserManager.getState() !== 'error' && browserManager.getState() !== 'starting',
      contextRunning: context !== null,
      pageRunning: page !== null,
      loggedIn: browserManager.isHealthy(),
      currentUrl: page ? page.url() : 'N/A',
      lastRefresh: browserManager.getLastRefresh() || 'N/A',
      queueLength: browserManager.getQueueLength(),
      browserUptime: browserManager.getUptime()
    });
  } catch (err: any) {
    logger.error(`[BrowserController] Failed to retrieve status: ${err.message}`);
    res.status(500).json({
      error: 'Failed to retrieve browser status',
      code: 'STATUS_RETRIEVAL_FAILED'
    });
  }
};

export const restartBrowser = async (req: Request, res: Response): Promise<void> => {
  logger.info('[BrowserController] Manual browser restart triggered.');
  try {
    await browserManager.restart();
    res.status(200).json({
      success: true,
      message: 'Browser restarted successfully'
    });
  } catch (err: any) {
    logger.error(`[BrowserController] Failed to restart browser: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to restart browser',
      code: 'BROWSER_RESTART_FAILED'
    });
  }
};
