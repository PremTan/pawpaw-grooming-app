// src/utils/services.js

export const SERVICES = [
  {
    id: 'haircut',
    name: 'Hair Cut',
    icon: '✂️',
    description: 'Breed-specific styling cuts for all dog & cat breeds. Our groomers are trained in the latest cuts.',
    duration: '45 min',
    basePrice: 400,
    price: '₹400 – ₹800',
    color: '#D4AF37',
    image: '',
  },
  {
    id: 'spa_bath',
    name: 'Spa Bath',
    icon: '🛁',
    description: 'Luxurious bath with premium shampoos, conditioning treatment, blow dry & ear cleaning.',
    duration: '60 min',
    basePrice: 500,
    price: '₹500 – ₹1000',
    color: '#4A9EBF',
    image: '',
  },
  {
    id: 'hairstyle',
    name: 'Hair Style',
    icon: '💅',
    description: 'Creative styling, bows, bandanas & finishing touches to make your pet look their best.',
    duration: '30 min',
    basePrice: 300,
    price: '₹300 – ₹600',
    color: '#BF6FA0',
    image: '',
  },
  {
    id: 'nail_cutting',
    name: 'Nail Cutting',
    icon: '🐾',
    description: 'Safe & precise nail trimming with nail filing. Includes paw pad moisturizing treatment.',
    duration: '20 min',
    basePrice: 150,
    price: '₹150 – ₹300',
    color: '#6BAF6B',
    image: '',
  },
  {
    id: 'full_grooming',
    name: 'Full Grooming Package',
    icon: '⭐',
    description: 'Complete grooming — bath, haircut, hairstyle, nail cutting, ear cleaning & more.',
    duration: '2 hrs',
    basePrice: 1000,
    price: '₹1000 – ₹2000',
    color: '#D4AF37',
    image: '',
  },
  {
    id: 'teeth_cleaning',
    name: 'Teeth Cleaning',
    icon: '🦷',
    description: 'Gentle dental hygiene service to keep your pet\'s teeth clean and breath fresh.',
    duration: '25 min',
    basePrice: 200,
    price: '₹200 – ₹400',
    color: '#7BA7BC',
    image: '',
  },
  {
    id: 'ear_cleaning',
    name: 'Ear Cleaning',
    icon: '👂',
    description: 'Thorough ear canal cleaning to prevent infections and keep ears healthy.',
    duration: '15 min',
    basePrice: 100,
    price: '₹100 – ₹200',
    color: '#E8A87C',
    image: '',
  },
  {
    id: 'de_shedding',
    name: 'De-Shedding Treatment',
    icon: '🌿',
    description: 'Reduces excessive shedding by up to 80%. Includes special shampoo and blow-out treatment.',
    duration: '75 min',
    basePrice: 700,
    price: '₹700 – ₹1400',
    color: '#5DB075',
    image: '',
  },
]

export const TIME_SLOTS = [
  '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
  '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM',
]

export const PET_TYPES = [
  'Dog', 'Cat', 'Rabbit', 'Bird',
  'Hamster', 'Guinea Pig', 'Fish',
  'Turtle', 'Parrot', 'Other'
]

export const DOG_BREEDS = [
  'Labrador Retriever', 'German Shepherd', 'Golden Retriever', 'Bulldog',
  'Beagle', 'Poodle', 'Rottweiler', 'Yorkshire Terrier', 'Boxer',
  'Dachshund', 'Shih Tzu', 'Siberian Husky', 'Dobermann', 'Great Dane',
  'Cocker Spaniel', 'Border Collie', 'Maltese', 'Pomeranian', 'Chihuahua',
  'Indian Spitz', 'Rajapalayam', 'Mudhol Hound', 'Mixed Breed / Indie',
]

export const CAT_BREEDS = [
  'Persian', 'Siamese', 'Maine Coon', 'Bengal', 'Ragdoll',
  'British Shorthair', 'Abyssinian', 'Scottish Fold', 'Sphynx',
  'Russian Blue', 'Indian Domestic Cat', 'Mixed Breed',
]

export const BOOKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

// WhatsApp number is now fetched from Firebase settings and must be set by admin
// Fetch it from: db.collection('settings').doc('contactInfo')
export const getWhatsAppNumber = async (db) => {
  try {
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'settings', 'contactInfo'))
    return snap.exists() ? snap.data().whatsappNumber : '919146661718'
  } catch {
    return '919146661718' // fallback
  }
}

export const WHATSAPP_NUMBER = '919146661718' // fallback default

export const buildWhatsAppMessage = (booking) => {
  const emoji = booking.isWalkIn ? '🏪 Walk-in' : '📱 Online'
  return encodeURIComponent(
    `🐾 *New Booking - Paw Paw Grooming*\n\n` +
    `${emoji} Appointment\n` +
    `👤 *Owner:* ${booking.ownerName}\n` +
    `📞 *Phone:* ${booking.phone}\n` +
    `🐶 *Pet:* ${booking.petName} (${booking.petType}${booking.petBreed ? `, ${booking.petBreed}` : ''})\n` +
    `✂️ *Service:* ${booking.serviceName}\n` +
    `📅 *Date:* ${booking.date}\n` +
    `🕐 *Time:* ${booking.slot}\n` +
    (booking.notes ? `📝 *Notes:* ${booking.notes}\n` : '') +
    `\n_Booking ID: #${(booking.id || '').slice(0, 8).toUpperCase()}_`
  )
}
