import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const money = value => `Rs ${Number(value || 0).toLocaleString('en-IN')}`

function formatDate(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return value || '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMonthYear(month, year) {
  return `${MONTH_NAMES[(month || 1) - 1] || 'Unknown'} ${year || ''}`
}

function getStatusLabel(monthlySalary, salaryPaid) {
  if (monthlySalary <= 0) return 'Paid'
  if (salaryPaid >= monthlySalary) return 'Paid'
  if (salaryPaid > 0) return 'Partially Paid'
  return 'Pending'
}

export async function createPayrollPdfBlob(employee, selectedMonth, selectedYear, payments = []) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const margin = 36
  const pageWidth = doc.internal.pageSize.getWidth()
  const headerY = 42

  const salaryPaid = payments.filter(item => item.paymentType === 'Salary').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const advancePaid = payments.filter(item => item.paymentType === 'Advance').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const bonusPaid = payments.filter(item => item.paymentType === 'Bonus').reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const totalPaid = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const pendingSalary = Math.max(Number(employee.monthlySalary || 0) - salaryPaid, 0)
  const status = getStatusLabel(Number(employee.monthlySalary || 0), salaryPaid)
  const lastPayment = payments
    .filter(item => item.paymentDate)
    .map(item => new Date(item.paymentDate))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Payroll Summary', margin, headerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const employeeName = employee.name || 'Unknown'
  const employeeRole = employee.role || 'Team Member'
  doc.text(`Employee: ${employeeName}`, margin, headerY + 24)
  doc.text(`Role: ${employeeRole}`, margin, headerY + 40)
  doc.text(`Selected Month: ${formatMonthYear(selectedMonth, selectedYear)}`, margin, headerY + 56)
  doc.text(`Generated: ${formatDate(new Date())}`, margin, headerY + 72)

  const infoTop = headerY + 100
  const sectionWidth = (pageWidth - margin * 2 - 18) / 2

  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, infoTop)
  doc.setFont('helvetica', 'normal')
  const summaryLines = [
    `Monthly Salary: ${money(employee.monthlySalary)}`,
    `Paid This Month: ${money(totalPaid)}`,
    `Pending Salary: ${money(pendingSalary)}`,
    `Advance Paid: ${money(advancePaid)}`,
    `Last Payment Date: ${lastPayment ? formatDate(lastPayment) : '-'}`,
    `Status: ${status}`,
  ]
  doc.text(summaryLines, margin, infoTop + 18, { maxWidth: sectionWidth })

  const paymentsTop = infoTop + 100
  doc.setFont('helvetica', 'bold')
  doc.text('Payment History', margin, paymentsTop)

  const tableBody = payments.map(payment => [
    formatDate(payment.paymentDate),
    payment.paymentType || '-',
    payment.paymentMethod || '-',
    `${MONTH_NAMES[(payment.salaryMonth || 1) - 1] || '-'} ${payment.salaryYear || '-'}`,
    money(payment.amount),
    payment.notes || '-',
  ])

  autoTable(doc, {
    startY: paymentsTop + 14,
    head: [['Date', 'Type', 'Method', 'Salary Month', 'Amount', 'Notes']],
    body: tableBody,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [34, 68, 104], textColor: 255 },
    theme: 'grid',
    columnStyles: {
      0: { cellWidth: 72 },
      1: { cellWidth: 62 },
      2: { cellWidth: 72 },
      3: { cellWidth: 72 },
      4: { cellWidth: 56 },
      5: { cellWidth: 118 },
    },
    styles: { overflow: 'linebreak', cellWidth: 'wrap' },
  })

  return doc.output('blob')
}

export async function downloadPayrollPdf(employee, selectedMonth, selectedYear, payments = []) {
  const blob = await createPayrollPdfBlob(employee, selectedMonth, selectedYear, payments)
  const fileName = `${employee.name ? employee.name.replace(/\s+/g, '_') : 'employee'}_payroll_${selectedMonth}_${selectedYear}.pdf`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
