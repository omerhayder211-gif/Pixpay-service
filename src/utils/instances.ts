import { BrowserManager } from '../browser/BrowserManager';
import { PixPayService } from '../services/pixpay.service';

export const browserManager = new BrowserManager();
export const pixpayService = new PixPayService(browserManager);
