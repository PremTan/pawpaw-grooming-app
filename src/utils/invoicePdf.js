import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const MAX_INVOICE_BYTES = 1024 * 1024

const money = value => `Rs ${Number(value || 0).toLocaleString('en-IN')}`
const clean = value => String(value || '').trim()
const shortId = id => String(id || '').slice(0, 8).toUpperCase()

export const getInvoiceNumber = booking => {
  const date = clean(booking?.date).replaceAll('-', '') || new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `INV${date}${shortId(booking?.id) || 'BOOKING'}`
}

export const getInvoiceFileName = booking => `${getInvoiceNumber(booking)}.pdf`

export const getInvoiceSummary = (booking, businessInfo = {}) => {
  const shopName = businessInfo.contact?.shopName || 'Paw Paw'
  const invoiceNo = getInvoiceNumber(booking)
  const amountPaid = getAmountPaid(booking)
  const gstAmount = getGstAmount(booking)
  const total = getTotalAmount(booking)

  return [
    `${shopName} invoice`,
    `Invoice No: ${invoiceNo}`,
    `Customer: ${booking?.ownerName || '-'}`,
    `Phone: ${booking?.phone || '-'}`,
    `Pet: ${buildPetLabel(booking)}`,
    `Service: ${booking?.serviceName || '-'}`,
    `Date/Time: ${booking?.date || '-'} ${booking?.slot || ''}`.trim(),
    `Amount Paid: ${money(amountPaid)}`,
    `GST: ${gstAmount > 0 ? money(gstAmount) : 'Not applicable'}`,
    `Total: ${money(total)}`,
  ].join('\n')
}

export async function createInvoicePdfBlob(booking, businessInfo = {}) {
  const withLogo = await buildInvoicePdf(booking, businessInfo, true)
  let blob = withLogo.output('blob')
  if (blob.size <= MAX_INVOICE_BYTES) return blob

  const withoutLogo = await buildInvoicePdf(booking, businessInfo, false)
  blob = withoutLogo.output('blob')
  return blob
}


export async function createInvoicePdfFile(booking, businessInfo = {}) {
  const blob = await createInvoicePdfBlob(booking, businessInfo)
  return new File([blob], getInvoiceFileName(booking), { type: 'application/pdf' })
}

export async function shareInvoicePdfFile(booking, businessInfo = {}, title = 'Share Invoice PDF') {
  const file = await createInvoicePdfFile(booking, businessInfo)
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title,
      text: `${businessInfo.contact?.shopName || 'Paw Paw'} invoice ${getInvoiceNumber(booking)}`,
      files: [file],
    })
    return true
  }

  await downloadInvoicePdf(booking, businessInfo)
  return false
}
export async function downloadInvoicePdf(booking, businessInfo = {}) {
  const blob = await createInvoicePdfBlob(booking, businessInfo)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = getInvoiceFileName(booking)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function viewInvoicePdf(booking, businessInfo = {}) {
  const blob = await createInvoicePdfBlob(booking, businessInfo)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function getAmountPaid(booking) {
  return Number(booking?.amountCollected || booking?.estimatedTotal || 0)
}

function getGstAmount(booking) {
  const raw = booking?.gstAmount ?? booking?.gst ?? booking?.taxAmount ?? booking?.tax
  const parsed = Number(raw || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function getTotalAmount(booking) {
  const explicitTotal = Number(booking?.totalAmount || 0)
  if (explicitTotal > 0) return explicitTotal
  return getAmountPaid(booking) + getGstAmount(booking)
}

function buildPetLabel(booking) {
  const details = [booking?.petType, booking?.petBreed].filter(Boolean).join(', ')
  return `${booking?.petName || '-'}${details ? ` (${details})` : ''}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return value || '-'
  return date.toLocaleDateString('en-IN')
}

function numberToWords(value) {
  const n = Math.round(Number(value || 0))
  if (n === 0) return 'Zero rupees only'

  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  const belowHundred = num => num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ''}`
  const belowThousand = num => {
    const hundred = Math.floor(num / 100)
    const rest = num % 100
    return `${hundred ? `${ones[hundred]} hundred` : ''}${hundred && rest ? ' ' : ''}${rest ? belowHundred(rest) : ''}`.trim()
  }

  const parts = []
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${belowThousand(crore)} crore`)
  if (lakh) parts.push(`${belowThousand(lakh)} lakh`)
  if (thousand) parts.push(`${belowThousand(thousand)} thousand`)
  if (rest) parts.push(belowThousand(rest))
  return `${parts.join(' ')} rupees only`.replace(/^./, c => c.toUpperCase())
}

function getLogoDataUrl(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve('')
      return
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const maxSide = 180
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.68))
      } catch {
        resolve('')
      }
    }
    image.onerror = () => resolve('')
    image.src = url
  })
}

function drawBox(doc, x, y, width, height) {
  doc.setDrawColor(210, 214, 220)
  doc.setLineWidth(1)
  doc.rect(x, y, width, height)
}

function drawTextBox(doc, title, lines, x, y, width, height) {
  drawBox(doc, x, y, width, height)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(42, 45, 50)
  doc.text(title, x + 10, y + 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(65, 70, 78)
  doc.text(lines.filter(Boolean), x + 10, y + 38, { maxWidth: width - 20, lineHeightFactor: 1.25 })
}

async function buildInvoicePdf(booking, businessInfo, includeLogo) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const contact = businessInfo.contact || {}
  const footer = businessInfo.footer || {}
  const shopName = contact.shopName || 'Paw Paw'
  const invoiceNo = getInvoiceNumber(booking)
  const invoiceDate = new Date()
  const amountPaid = getAmountPaid(booking)
  const gstAmount = getGstAmount(booking)
  const total = getTotalAmount(booking)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 26
  const contentWidth = pageWidth - margin * 2

  doc.setTextColor(35, 38, 43)
  doc.setDrawColor(210, 214, 220)
  doc.setLineWidth(1)
  doc.rect(10, 20, pageWidth - 20, pageHeight - 40)

  const logoData = includeLogo ? await getLogoDataUrl(contact.logoUrl) : ''
  drawBox(doc, margin + 8, 66, 92, 92)
  if (logoData) {
    doc.addImage(logoData, 'JPEG', margin + 16, 74, 76, 76, undefined, 'FAST')
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text('Paw Paw', margin + 25, 118, { maxWidth: 60 })
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(shopName, margin + 122, 80)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(65, 70, 78)
  doc.text([
    contact.address || '',
    footer.email || '',
    businessInfo.whatsappNumber || '',
  ].filter(Boolean), margin + 122, 102, { maxWidth: 250, lineHeightFactor: 1.35 })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(20, 22, 26)
  doc.text('Invoice', pageWidth - margin - 8, 92, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(105, 111, 122)
  doc.text(`Invoice No: ${invoiceNo}`, pageWidth - margin - 8, 116, { align: 'right' })
  doc.text(`Invoice Date: ${formatDate(invoiceDate)}`, pageWidth - margin - 8, 136, { align: 'right' })
  doc.text(`Due Date: ${formatDate(addDays(invoiceDate, 3))}`, pageWidth - margin - 8, 156, { align: 'right' })

  drawBox(doc, margin + 8, 205, 260, 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(60, 64, 72)
  doc.text('Bill To', margin + 18, 223)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(booking?.ownerName || '-', margin + 18, 262)
  doc.setFont('helvetica', 'normal')
  doc.text([booking?.userEmail || '', booking?.phone || ''].filter(Boolean), margin + 18, 280, { lineHeightFactor: 1.35 })

  const address = booking?.address || contact.address || '-'
  doc.setFont('helvetica', 'bold')
  doc.text('Billing Address', margin + 18, 326)
  doc.setFont('helvetica', 'normal')
  doc.text(address, margin + 18, 344, { maxWidth: 225, lineHeightFactor: 1.3 })

  doc.setFont('helvetica', 'bold')
  doc.text('Service Address', margin + 300, 326)
  doc.setFont('helvetica', 'normal')
  doc.text(booking?.bookingType === 'home' ? address : (contact.address || 'In-store visit'), margin + 300, 344, { maxWidth: 230, lineHeightFactor: 1.3 })

  autoTable(doc, {
    startY: 382,
    margin: { left: margin + 8, right: margin + 8 },
    theme: 'grid',
    head: [['No.', 'Item', 'Quantity', 'Rate (Rs)', 'Amount (Rs)']],
    body: [[
      '01',
      [booking?.serviceName || '-', `Pet: ${buildPetLabel(booking)}`, `Appointment: ${booking?.date || '-'} ${booking?.slot || '-'}`].join('\n'),
      '1',
      Number(amountPaid || 0).toLocaleString('en-IN'),
      Number(amountPaid || 0).toLocaleString('en-IN'),
    ]],
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 8, textColor: [45, 49, 56], lineColor: [210, 214, 220], lineWidth: 1 },
    headStyles: { fillColor: [255, 255, 255], textColor: [45, 49, 56], fontStyle: 'bold', lineColor: [210, 214, 220], lineWidth: 1 },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 240 },
      2: { cellWidth: 75 },
      3: { cellWidth: 80 },
      4: { cellWidth: 85 },
    },
  })

  const tableBottom = doc.lastAutoTable.finalY + 14
  drawTextBox(doc, 'Terms and Conditions', ['Invoice is generated only after the appointment is marked completed.', 'Payment received as recorded by admin.'], margin + 8, tableBottom, 260, 104)
  drawTextBox(doc, 'Customer Note', [booking?.notes || ''], margin + 8, tableBottom + 118, 260, 54)

  const summaryX = margin + 285
  const labelW = 150
  const valueW = contentWidth - 285 - 8 - labelW
  const rows = [
    ['Sub Total', money(amountPaid)],
    ['GST', gstAmount > 0 ? money(gstAmount) : 'Not applicable'],
    ['Adjustment', money(0)],
    ['Total', money(total)],
  ]

  rows.forEach(([label, value], index) => {
    const y = tableBottom + index * 34
    drawBox(doc, summaryX, y, labelW, 25)
    drawBox(doc, summaryX + labelW + 6, y, valueW, 25)
    doc.setFont('helvetica', index === rows.length - 1 ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.setTextColor(35, 38, 43)
    doc.text(label, summaryX + 10, y + 17)
    doc.text(value, summaryX + labelW + valueW - 2, y + 17, { align: 'right' })
  })

  drawTextBox(doc, 'Total in words', [numberToWords(total)], summaryX, tableBottom + 144, labelW + valueW + 6, 54)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(35, 38, 43)
  doc.text('Authorized Signature', pageWidth - margin - 70, pageHeight - 58, { align: 'center' })

  return doc
}

