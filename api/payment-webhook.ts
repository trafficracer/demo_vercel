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
 * RAZORPAY WEBHOOK HANDLER FOR VERCEL
 * 
 * ARCHITECTURE DECISIONS:
 * 
 * 1. SINGLE TABLE APPROACH:
 *    We use one "eventsregistrations" table instead of 15 separate event tables because:
 *    - Easier to maintain and query across all events
 *    - Better performance with proper indexing
 *    - Simpler schema evolution and backup strategies
 *    - event_id column differentiates between different events
 * 
 * 2. EVENT IDENTIFICATION:
 *    Each Razorpay Payment Page has notes.event_id (e.g., "event_a", "event_b")
 *    This allows us to identify which event the user registered for
 * 
 * 3. FRONTEND QUERIES:
 *    Frontend can query user's eventsregistrations like:
 *    ```javascript
 *    const { data } = await supabase
 *      .from('registrations')
 *      .select('*')
 *      .eq('user_email', userEmail);
 *    ```
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 
 * 1. Environment Setup:
 *    - Copy .env.example to .env.local
 *    - Add your Supabase URL and Service Role Key
 * 
 * 2. Deploy to Vercel:
 *    ```bash
 *    npm install -g vercel
 *    vercel --prod
 *    ```
 * 
 * 3. Configure Razorpay:
 *    - Go to Razorpay Dashboard → Settings → Webhooks
 *    - Add webhook URL: https://your-app.vercel.app/api/payment-webhook
 *    - Select event: payment.captured
 *    - Save the webhook
 * 
 * 4. Create Payment Pages:
 *    - Create 15 Payment Pages in Razorpay Dashboard
 *    - For each page, add unique notes.event_id (event_a, event_b, etc.)
 *    - When users pay, this webhook will save registration data automatically
 */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Set CORS headers for webhook requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed. Only POST requests are accepted.',
      allowed_methods: ['POST']
    });
  }

  try {
    // Validate environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing Supabase credentials' 
      });
    }

    // Initialize Supabase client with Service Role Key for write operations
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Parse the webhook payload
    const payload: RazorpayWebhookPayload = req.body;

    console.log('Received webhook:', {
      event: payload.event,
      timestamp: new Date().toISOString()
    });

    // Only process payment.captured events
    if (payload.event !== 'payment.captured') {
      console.log('Ignoring event:', payload.event);
      return res.status(200).json({ 
        message: `Event ignored. Only payment.captured events are processed. Received: ${payload.event}` 
      });
    }

    // Extract payment data
    const { payment } = payload;

    // Comprehensive validation of required fields
    const missingFields: string[] = [];
    if (!payment?.id) missingFields.push('payment.id');
    if (!payment?.email) missingFields.push('payment.email');
    if (typeof payment?.amount !== 'number') missingFields.push('payment.amount');
    if (!payment?.notes?.event_id) missingFields.push('payment.notes.event_id');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return res.status(400).json({ 
        error: 'Missing required payment data',
        missing_fields: missingFields,
        received_data: {
          hasPayment: !!payment,
          hasId: !!payment?.id,
          hasEmail: !!payment?.email,
          hasAmount: typeof payment?.amount,
          hasNotes: !!payment?.notes,
          hasEventId: !!payment?.notes?.event_id
        }
      });
    }

    // Convert amount from paise to rupees (Razorpay sends amount in paise)
    const amountInRupees = Math.round(payment.amount / 100);

    // Prepare registration record
    const registrationData: RegistrationRecord = {
      event_id: payment.notes.event_id,
      user_email: payment.email.toLowerCase().trim(), // Normalize email
      amount: amountInRupees,
      payment_id: payment.id,
      status: 'success'
    };

    console.log('Attempting to insert registration:', {
      event_id: registrationData.event_id,
      user_email: registrationData.user_email,
      amount: registrationData.amount,
      payment_id: registrationData.payment_id
    });

    // Insert into Supabase registrations table
    const { data, error } = await supabase
      .from('eventsregistrations')
      .insert([registrationData])
      .select();

    if (error) {
      console.error('Supabase insertion error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      // Handle duplicate payment ID error
      if (error.code === '23505' && error.message.includes('payment_id')) {
        console.log('Duplicate payment ID detected:', payment.id);
        return res.status(200).json({ 
          message: 'Payment already processed',
          payment_id: payment.id,
          duplicate: true
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to save registration data',
        details: error.message,
        code: error.code
      });
    }

    if (!data || data.length === 0) {
      console.error('No data returned from Supabase insert');
      return res.status(500).json({ 
        error: 'Registration may not have been saved properly' 
      });
    }

    console.log('Registration saved successfully:', {
      id: data[0].id,
      event_id: data[0].event_id,
      user_email: data[0].user_email
    });

    // Return success response to Razorpay
    return res.status(200).json({ 
      message: 'Payment processed and registration saved successfully',
      registration_id: data[0].id,
      event_id: data[0].event_id,
      amount_rupees: amountInRupees,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook processing error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({ 
      error: 'Internal server error while processing webhook',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
}