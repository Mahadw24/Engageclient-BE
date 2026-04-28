/**
 * Run: node --env-file=.env src/scripts/create-superadmin.js
 *
 * Creates (or resets) the EngageClient superadmin account.
 * Prints credentials to the terminal — save them somewhere safe.
 */

import mongoose from 'mongoose'
import crypto from 'crypto'
import { User } from '../models/user.js'
import { Agency } from '../models/agency.js'

const SUPERADMIN_EMAIL = 'superadmin@engageclient.com'
const SUPERADMIN_NAME  = 'EngageClient Admin'
const AGENCY_NAME      = 'EngageClient Platform'

function generatePassword(length = 16) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  return Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join('')
}

async function main() {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('❌  MONGODB_URI is not set in .env')
    process.exit(1)
  }

  await mongoose.connect(mongoUri)
  console.log('✅  Connected to MongoDB\n')

  // ── Agency ──────────────────────────────────────────────────────────────
  let agency = await Agency.findOne({ name: AGENCY_NAME })
  if (!agency) {
    agency = await Agency.create({
      name: AGENCY_NAME,
      email: SUPERADMIN_EMAIL,
      industry: 'Other',
      plan: 'business',
      status: 'active',
      subscriptionStatus: 'active',
      settings: {
        maxConversationsPerMonth: 999999,
        aiEnabled: true,
        is24x7: true,
        appointmentBooking: true,
        autoFollowUp: true,
      },
    })
    console.log('✅  Superadmin agency created:', agency.name)
  } else {
    console.log('ℹ️   Agency already exists:', agency.name)
  }

  // ── User ────────────────────────────────────────────────────────────────
  const newPassword = generatePassword()

  const existingUser = await User.findOne({ email: SUPERADMIN_EMAIL })
  if (existingUser) {
    existingUser.password = newPassword
    existingUser.status = 'active'
    existingUser.role = 'owner'
    existingUser.isSuperAdmin = true
    await existingUser.save()
    console.log('ℹ️   Superadmin already existed — password has been reset\n')
  } else {
    await User.create({
      name: SUPERADMIN_NAME,
      email: SUPERADMIN_EMAIL,
      password: newPassword,
      role: 'owner',
      agencyId: agency._id,
      status: 'active',
      isSuperAdmin: true,
    })
    console.log('✅  Superadmin user created\n')
  }

  // ── Print credentials ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════')
  console.log('  SUPERADMIN CREDENTIALS')
  console.log('═══════════════════════════════════════════')
  console.log(`  Email    : ${SUPERADMIN_EMAIL}`)
  console.log(`  Password : ${newPassword}`)
  console.log('  URL      : /admin/login')
  console.log('═══════════════════════════════════════════')
  console.log('\n⚠️  Save these credentials — password will not be shown again.\n')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('❌  Error:', err.message)
  process.exit(1)
})
