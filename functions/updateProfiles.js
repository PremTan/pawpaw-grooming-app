const admin = require('firebase-admin')

admin.initializeApp()

const db = admin.firestore()

async function updateProfiles() {
  const snapshot = await db.collection('profiles').get()

  let batch = db.batch()
  let count = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const phone = String(data.phone || '').trim()
    const address = String(data.address || '').trim()
    const addresses = Array.isArray(data.addresses)
      ? data.addresses.filter((item) => Boolean(item?.address?.toString().trim()))
      : []

    const isComplete = Boolean(phone) && (Boolean(address) || addresses.length > 0)

    batch.update(doc.ref, {
      isProfileComplete: isComplete,
    })

    count += 1
    if (count % 500 === 0) {
      await batch.commit()
      batch = db.batch()
    }
  }

  if (count % 500 !== 0) {
    await batch.commit()
  }

  console.log(`Updated ${count} profiles`)
}

updateProfiles().catch((error) => {
  console.error('Failed to update profiles:', error)
  process.exit(1)
})
