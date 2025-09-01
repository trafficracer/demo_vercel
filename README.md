# Razorpay Webhook Backend

A TypeScript backend service for handling Razorpay Payment Page webhooks and storing registration data in Supabase. Designed for deployment on Vercel.

## Quick Setup

### 1. Clone and Install
```bash
git clone <your-repo>
cd razorpay-webhook-backend
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
```bash
cp .env.example .env.local
```

### 3. Supabase Setup
- Run the migration file in your Supabase SQL editor to create the `registrations` table
- Get your Service Role Key from Supabase Dashboard → Settings → API

### 4. Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```

### 5. Configure Razorpay
- Add webhook URL: `https://your-app.vercel.app/api/payment-webhook`
- Select event: `payment.captured`
- Create Payment Pages with unique `notes.event_id` values

## Project Structure

```
├── api/
│   └── payment-webhook.ts    # Webhook handler
├── supabase/
│   └── migrations/
│       └── create_registrations_table.sql
├── package.json
├── vercel.json
├── tsconfig.json
└── .env.example
```

## Database Schema

The `registrations` table stores:
- `id`: Auto-increment primary key
- `event_id`: Event identifier from payment page notes
- `user_email`: Customer email
- `amount`: Payment amount in rupees (converted from paise)
- `payment_id`: Razorpay payment ID
- `status`: Always "success" for captured payments
- `created_at`: Timestamp of registration

## How It Works

1. User completes payment on Razorpay Payment Page
2. Razorpay sends webhook to `/api/payment-webhook`
3. Webhook validates the `payment.captured` event
4. Extracts payment data and converts amount from paise to rupees
5. Saves registration to Supabase `registrations` table
6. Returns success/error response

## Security

- Uses Supabase Service Role Key for secure database writes
- Row Level Security (RLS) enabled on registrations table
- Input validation for all required fields
- Proper error handling and logging