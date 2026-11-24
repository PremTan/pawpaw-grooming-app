// src/components/SEO.jsx
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ROUTE_SEO = {
  '/': {
    title: 'Paw Paw | Best Pet Grooming, Boarding & Dog Walking in Pune',
    description: 'Paw Paw is Pune\'s premier pet care centre in Dhayari offering salon & home pet grooming, cage-free pet boarding hostel, and daily GPS-tracked dog walking.',
    keywords: 'pet grooming Pune, dog grooming Dhayari, cat grooming Pune, pet boarding Pune, dog hostel Pune, dog walker Pune, pet salon',
  },
  '/services': {
    title: 'Pet Grooming & Spa Packages in Pune | Paw Paw Centre',
    description: 'Full-service dog & cat grooming, warm spa baths, breed haircuts, hygiene wash, nail clipping, and anti-tick treatments in Pune. Center & home visits.',
    keywords: 'pet grooming services Pune, dog haircut Dhayari, cat bath Pune, pet spa Pune, home pet grooming Pune',
  },
  '/book': {
    title: 'Book Pet Grooming Appointment in Pune | Paw Paw Salon & Home Visit',
    description: 'Instant online slot booking for dog and cat grooming at Paw Paw Centre or doorstep home visits in Pune. Certified stylists & gentle handling.',
    keywords: 'book pet grooming online, dog grooming appointment Pune, home visit dog groomer, cat grooming booking',
  },
  '/book-walking': {
    title: 'Daily Dog Walking Packages in Pune | GPS Tracked | Paw Paw',
    description: 'Professional daily dog walking service with certified walkers, live GPS tracking, pee/poop updates, and photo reports in Dhayari, Pune.',
    keywords: 'dog walking service Pune, dog walker Dhayari, monthly dog walking package, pet exercise Pune',
  },
  '/book-boarding': {
    title: 'Cage-Free Pet Boarding & Dog Hostel in Pune | Paw Paw',
    description: 'Hygienic, 24/7 attended, cage-free dog and cat boarding hostel in Dhayari, Pune. Nutritious meals, play areas, and daily video/photo updates.',
    keywords: 'pet boarding Pune, dog hostel Dhayari, cat boarding Pune, dog daycare Pune, pet hotel Pune',
  },
  '/gallery': {
    title: 'Pet Transformations & Boarding Gallery | Paw Paw Pune',
    description: 'See happy pets after their haircuts, baths, spa treatments, and fun play sessions at Paw Paw Pet Care Centre in Pune.',
    keywords: 'pet grooming gallery, dog haircuts Pune, pet photos, cat grooming photos',
  },
  '/reviews': {
    title: 'Customer Reviews & Ratings | Paw Paw Pet Care Pune',
    description: 'Read 5-star Google ratings and verified customer reviews from pet parents across Pune for Grooming, Boarding, and Dog Walking.',
    keywords: 'paw paw pet grooming reviews, best pet groomer Pune ratings, dog boarding reviews Pune',
  },
  '/team': {
    title: 'Certified Pet Groomers & Care Team | Paw Paw Pune',
    description: 'Meet our passionate certified groomers, professional dog walkers, and 24/7 boarding caregivers dedicated to treating your pet with love.',
    keywords: 'certified pet groomers Pune, professional dog handlers, paw paw team',
  },
}

function updateMetaTag(name, content, isProperty = false) {
  if (!content) return
  const attr = isProperty ? 'property' : 'name'
  let tag = document.querySelector(`meta[${attr}="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function updateCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

export default function SEO() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Only manage SEO for public customer routes (skip admin & walker pages)
    if (pathname.startsWith('/admin') || pathname.startsWith('/walker')) {
      document.title = 'Paw Paw Staff Portal'
      let robots = document.querySelector('meta[name="robots"]')
      if (!robots) {
        robots = document.createElement('meta')
        robots.setAttribute('name', 'robots')
        document.head.appendChild(robots)
      }
      robots.setAttribute('content', 'noindex, nofollow')
      return
    }

    const seoData = ROUTE_SEO[pathname] || ROUTE_SEO['/']
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pawpawpetgrooming.in'
    const fullUrl = `${origin}${pathname}`

    // 1. Update Title & Meta
    document.title = seoData.title
    updateMetaTag('description', seoData.description)
    if (seoData.keywords) updateMetaTag('keywords', seoData.keywords)
    updateMetaTag('robots', 'index, follow')

    // 2. Canonical URL (always dynamic origin)
    updateCanonical(fullUrl)

    // 3. OpenGraph tags
    updateMetaTag('og:title', seoData.title, true)
    updateMetaTag('og:description', seoData.description, true)
    updateMetaTag('og:url', fullUrl, true)
    updateMetaTag('og:type', 'website', true)

    // 4. Twitter tags
    updateMetaTag('twitter:title', seoData.title)
    updateMetaTag('twitter:description', seoData.description)

    // 5. Injected JSON-LD LocalBusiness & PetGroomingSalon Schema
    const schemaId = 'pawpaw-local-schema'
    let schemaScript = document.getElementById(schemaId)
    if (!schemaScript) {
      schemaScript = document.createElement('script')
      schemaScript.id = schemaId
      schemaScript.type = 'application/ld+json'
      document.head.appendChild(schemaScript)
    }

    const localBusinessSchema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['PetGroomingSalon', 'AnimalShelter', 'LocalBusiness'],
          '@id': `${origin}/#business`,
          'name': 'Paw Paw Pet Grooming, Boarding & Dog Walking Centre',
          'alternateName': 'Paw Paw Pet Care',
          'url': origin,
          'logo': `${origin}/icon-512.png`,
          'image': `${origin}/icon-512.png`,
          'telephone': '+919021459467',
          'email': 'pawpawgrooming@gmail.com',
          'priceRange': '₹₹',
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': 'Dhayari',
            'addressLocality': 'Pune',
            'addressRegion': 'Maharashtra',
            'postalCode': '411041',
            'addressCountry': 'IN',
          },
          'geo': {
            '@type': 'GeoCoordinates',
            'latitude': 18.4484,
            'longitude': 73.8090,
          },
          'areaServed': [
            { '@type': 'City', 'name': 'Pune' },
            { '@type': 'AdministrativeArea', 'name': 'Dhayari' },
            { '@type': 'AdministrativeArea', 'name': 'Sinhagad Road' },
            { '@type': 'AdministrativeArea', 'name': 'Katraj' },
            { '@type': 'AdministrativeArea', 'name': 'Kothrud' },
            { '@type': 'AdministrativeArea', 'name': 'Warje' },
          ],
          'openingHoursSpecification': [
            {
              '@type': 'OpeningHoursSpecification',
              'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
              'opens': '09:00',
              'closes': '20:30',
            },
          ],
          'hasOfferCatalog': {
            '@type': 'OfferCatalog',
            'name': 'Pet Care Services',
            'itemListElement': [
              {
                '@type': 'Offer',
                'itemOffered': {
                  '@type': 'Service',
                  'name': 'Professional Pet Grooming & Spa',
                  'description': 'Bath, haircuts, styling, nail trimming, ear cleaning for dogs and cats.',
                },
              },
              {
                '@type': 'Offer',
                'itemOffered': {
                  '@type': 'Service',
                  'name': 'Daily Dog Walking Packages',
                  'description': 'Certified dog walkers, GPS live tracking, flexible time slots.',
                },
              },
              {
                '@type': 'Offer',
                'itemOffered': {
                  '@type': 'Service',
                  'name': 'Cage-Free Pet Boarding & Hostel',
                  'description': 'Safe overnight stay, nutritious meals, 24/7 care for dogs and cats.',
                },
              },
            ],
          },
        },
      ],
    }

    schemaScript.text = JSON.stringify(localBusinessSchema)
  }, [pathname])

  return null
}
