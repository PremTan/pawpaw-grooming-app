export const OWNER_ASSIGNEE_ID = 'owner'

export const getOwnerAssignee = (user) => ({
  id: OWNER_ASSIGNEE_ID,
  name: user?.displayName || user?.email?.split('@')[0] || 'Owner',
  email: user?.email || '',
  phone: '',
  photoUrl: user?.photoURL || '',
  role: 'Owner',
  isOwner: true,
  active: true,
})

export const getAssigneeLabel = (assignee) => {
  if (!assignee) return 'Owner'
  return assignee.isOwner ? `${assignee.name || 'Owner'} (Owner)` : assignee.name || 'Team Member'
}

export const buildAssigneePatch = (assignee) => ({
  assignedTeamMemberId: assignee.id,
  assignedTeamMemberName: assignee.name || 'Owner',
  assignedTeamMemberEmail: assignee.email || '',
  assignedTeamMemberPhone: assignee.phone || '',
  assignedTeamMemberPhotoUrl: assignee.photoUrl || '',
  assignedTeamMemberRole: assignee.role || (assignee.isOwner ? 'Owner' : 'Team Member'),
  assignedTeamMemberIsOwner: !!assignee.isOwner,
})

export const getBookingAssignee = (booking, ownerAssignee, teamMembers = []) => {
  if (!booking?.assignedTeamMemberId || booking.assignedTeamMemberId === OWNER_ASSIGNEE_ID || booking.assignedTeamMemberIsOwner) {
    return ownerAssignee
  }

  const member = teamMembers.find(item => item.id === booking.assignedTeamMemberId)
  if (member) return member

  return {
    id: booking.assignedTeamMemberId,
    name: booking.assignedTeamMemberName || 'Team Member',
    email: booking.assignedTeamMemberEmail || '',
    phone: booking.assignedTeamMemberPhone || '',
    photoUrl: booking.assignedTeamMemberPhotoUrl || '',
    role: booking.assignedTeamMemberRole || 'Team Member',
    active: true,
    isOwner: false,
  }
}