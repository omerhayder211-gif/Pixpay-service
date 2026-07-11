import { Request, Response, NextFunction } from 'express';

export const validatePaymentCreate = (req: Request, res: Response, next: NextFunction): void => {
  const { paymentId, userId, amount, paymentMethod, ...extra } = req.body;
  
  if (Object.keys(extra).length > 0) {
    res.status(400).json({
      success: false,
      error: `Unknown fields detected: ${Object.keys(extra).join(', ')}`,
      code: 'VALIDATION_ERROR'
    });
    return;
  }
  
  if (!paymentId || typeof paymentId !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid field: paymentId must be a string',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  if (!userId || typeof userId !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid field: userId must be a string',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  if (amount === undefined) {
    res.status(400).json({
      success: false,
      error: 'Missing field: amount is required',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({
      success: false,
      error: 'Invalid field: amount must be a positive number',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  if (!paymentMethod || typeof paymentMethod !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid field: paymentMethod must be a string',
      code: 'VALIDATION_ERROR'
    });
    return;
  }

  next();
};
