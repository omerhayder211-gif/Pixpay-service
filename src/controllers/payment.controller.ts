import { Request, Response } from 'express';
import { pixpayService } from '../utils/instances';
import { logger } from '../utils/logger';

function extractPixPayId(link: string): string {
  try {
    const url = new URL(link);
    const id = url.searchParams.get('id') || url.searchParams.get('order') || url.searchParams.get('tradeNo');
    if (id) return id;
    
    const hash = url.hash;
    if (hash) {
      const parts = hash.split('/');
      const last = parts[parts.length - 1];
      if (last && last !== 'pay' && last !== 'payin') return last;
    }
  } catch (e) {}
  
  return 'PX-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

export const createPaymentController = async (req: Request, res: Response): Promise<void> => {
  const { userId, paymentMethod, amount } = req.body;
  
  logger.info(`[PaymentController] Processing payment creation for user ${userId}`);
  
  try {
    const result = await pixpayService.createPayment({
      userId,
      paymentMethod,
      amount: String(amount)
    });

    const pixpayId = extractPixPayId(result.paymentLink);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    res.status(200).json({
      success: true,
      paymentLink: result.paymentLink,
      pixpayId,
      expiresAt,
      processingTimeMs: (result as any).totalDurationMs || 0
    });
  } catch (err: any) {
    logger.error(`[PaymentController] Payment execution failed: ${err.message}`);
    res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error during payment creation',
      code: 'PAYMENT_CREATION_FAILED'
    });
  }
};
