import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// TypeScript interfaces for Razorpay webhook payload
interface RazorpayPayment {
  id: string;
  email: string;
  amount: number; // Amount in paise
  notes: {
    event_id: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface RazorpayWebhookPayload {
  event: string;
  payment: RazorpayPayment;
  [key: string]: any;
}

interface RegistrationRecord {
  event_id: string;
  user_email: string;
  amount: number; // Amount in rupees
  payment_id: string;
  status: string;
}

/**
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Deploy to Vercel:
 *    - Connect your GitHub repo to Vercel
 *    - Add environment variables in Vercel dashboard:
 *      - SUPABASE_URL
 *      - SUPABASE_SERVICE_ROLE_KEY
 *    - Deploy the project
 * 
 * 2. Configure Razorpay:
 *    - Go to Razorpay Dashboard → Settings → Webhooks
 *    - Add webhook URL: https://your-vercel-app.vercel.app/api/payment-webhook
 *    - Select event: payment.captured
 *    - Save the webhook
 * 
 * 3. Create Payment Pages:
 *    - Create 15 Payment Pages in Razorpay Dashboard
 *    - For each page, add a unique notes.event_id (event_a, event_b, etc.)
 *    - When users pay, the webhook will automatically save registration data
 * 
 * 4. Supabase Setup:
 *    - Create the eventsregistrations table using the migration file
 *    - Ensure RLS policies are configured properly
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Only POST requests are accepted.' 
    });
  }

  try {
    // Initialize Supabase client with Service Role Key for write operations
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Parse the webhook payload
    const payload: RazorpayWebhookPayload = req.body;

    console.log('Received webhook:', payload.event);

    // Only process payment.captured events
    if (payload.event !== 'payment.captured') {
      console.log('Ignoring event:', payload.event);
      return res.status(200).json({ 
        message: 'Event ignored. Only payment.captured events are processed.' 
      });
    }

    // Extract payment data
    const { payment } = payload;

    // Validate required fields
    if (!payment.id || !payment.email || !payment.amount || !payment.notes?.event_id) {
      console.error('Missing required fields in payment data:', {
        hasId: !!payment.id,
        hasEmail: !!payment.email,
        hasAmount: !!payment.amount,
        hasEventId: !!payment.notes?.event_id
      });
      
      return res.status(400).json({ 
        error: 'Missing required payment data: id, email, amount, or notes.event_id' 
      });
    }

    // Convert amount from paise to rupees
    const amountInRupees = payment.amount / 100;

    // Prepare registration record
    const registrationData: RegistrationRecord = {
      event_id: payment.notes.event_id,
      user_email: payment.email,
      amount: amountInRupees,
      payment_id: payment.id,
      status: 'success'
    };

    console.log('Inserting registration:', registrationData);

    // Insert into Supabase
    const { data, error } = await supabase
      .from('eventsregistrations')
      .insert([registrationData])
      .select();

    if (error) {
      console.error('Supabase insertion error:', error);
      return res.status(500).json({ 
        error: 'Failed to save registration data',
        details: error.message 
      });
    }

    console.log('Registration saved successfully:', data[0]);

    // Return success response
    return res.status(200).json({ 
      message: 'Payment processed and registration saved successfully',
      registration_id: data[0].id
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    return res.status(500).json({ 
      error: 'Internal server error while processing webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}