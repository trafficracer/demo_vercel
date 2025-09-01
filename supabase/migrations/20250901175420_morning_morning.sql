/*
  # Create eventsregistrations table for Razorpay webhooks

  1. New Tables
    - `eventsregistrations`
      - `id` (uuid, primary key)
      - `event_id` (text, identifies which event from payment page notes)
      - `user_email` (text, customer email from Razorpay)
      - `amount` (integer, payment amount in rupees)
      - `payment_id` (text, unique Razorpay payment ID)
      - `status` (text, payment status - always "success" for captured payments)
      - `created_at` (timestamp, when registration was created)

  2. Security
    - Enable RLS on `eventsregistrations` table
    - Add policy for public read access (for admin dashboards)
    - Add policy for service role to insert webhook data

  3. Performance
    - Unique constraint on payment_id to prevent duplicate processing
    - Indexes on frequently queried columns (payment_id, user_email, event_id)
*/

CREATE TABLE IF NOT EXISTS eventsregistrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  user_email text NOT NULL,
  amount integer NOT NULL,
  payment_id text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE eventsregistrations ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_eventsregistrations_payment_id ON eventsregistrations(payment_id);
CREATE INDEX IF NOT EXISTS idx_eventsregistrations_user_email ON eventsregistrations(user_email);
CREATE INDEX IF NOT EXISTS idx_eventsregistrations_event_id ON eventsregistrations(event_id);
CREATE INDEX IF NOT EXISTS idx_eventsregistrations_created_at ON eventsregistrations(created_at);

-- RLS Policies
CREATE POLICY "Anyone can read eventsregistrations"
  ON eventsregistrations
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Service role can insert eventsregistrations"
  ON eventsregistrations
  FOR INSERT
  TO service_role
  WITH CHECK (true);