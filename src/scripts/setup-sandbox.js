/**
 * Setup Twilio WhatsApp Sandbox number in the database.
 *
 * Usage:
 *   node --env-file=.env src/scripts/setup-sandbox.js
 *
 * This creates a NumberModel entry for the Twilio sandbox number
 * so incoming sandbox messages are routed to your agency's flow.
 *
 * Prerequisites:
 *   1. Sign up and create a flow in the dashboard
 *   2. Copy your agencyId and flowId from the dashboard/DB
 *   3. Set SANDBOX_NUMBER below (default is Twilio's standard sandbox number)
 */

import mongoose from 'mongoose'
import { NumberModel } from '../models/number.js'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/engageclient'
const SANDBOX_NUMBER = process.env.TWILIO_SANDBOX_NUMBER || '+14155238886'

async function setup() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  // Find the first agency in the system
  const Agency = mongoose.model('Agency', new mongoose.Schema({}, { strict: false }))
  const agency = await Agency.findOne()
  if (!agency) {
    console.error('No agency found. Please sign up first in the dashboard.')
    process.exit(1)
  }
  console.log(`Found agency: ${agency.name || agency._id}`)

  // Find the first flow for this agency
  const Flow = mongoose.model('Flow', new mongoose.Schema({}, { strict: false }))
  const flow = await Flow.findOne({ agencyId: agency._id })
  if (!flow) {
    console.error('No flow found. Please create a flow first in the dashboard.')
    process.exit(1)
  }
  console.log(`Found flow: ${flow.name || flow._id}`)

  // Check if sandbox number already exists
  const existing = await NumberModel.findOne({ phoneNumber: SANDBOX_NUMBER })
  if (existing) {
    // Update it
    existing.agencyId = agency._id
    existing.flowId = flow._id
    existing.status = 'active'
    await existing.save()
    console.log(`Updated existing sandbox number: ${SANDBOX_NUMBER}`)
  } else {
    await NumberModel.create({
      agencyId: agency._id,
      phoneNumber: SANDBOX_NUMBER,
      twilioSid: 'sandbox',
      friendlyName: 'WhatsApp Sandbox',
      status: 'active',
      flowId: flow._id,
    })
    console.log(`Created sandbox number: ${SANDBOX_NUMBER} → flow "${flow.name}"`)
  }

  console.log('\nDone! Now:')
  console.log('1. Start ngrok:  ngrok http 3000')
  console.log('2. Set webhook in Twilio sandbox settings to: https://YOUR_NGROK_URL/api/whatsapp/webhook')
  console.log('3. Join the sandbox from WhatsApp: send "join <code>" to the sandbox number')
  console.log('4. Send a message — AI should reply using your flow prompt!')

  await mongoose.disconnect()
}

setup().catch((err) => {
  console.error(err)
  process.exit(1)
})
