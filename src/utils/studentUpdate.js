export async function requestStudentUpdate(isCrew, studentId, payload, fetchImplementation = fetch) {
  const path = '/api/students/' + encodeURIComponent(studentId)
  const body = isCrew ? {
    cycle: payload.cycle,
    extension_certainty: payload.extension_certainty,
    hearing_status: payload.hearing_status,
    notes: payload.notes,
  } : payload
  const response = await fetchImplementation(path + (isCrew ? '/hearing' : ''), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!isCrew || !response.ok) return response
  // Reload the same cycle so read-only examination fields remain visible after save.
  const result = await response.clone().json()
  if (!result.success) return response
  return fetchImplementation(path + '?cycle=' + encodeURIComponent(payload.cycle))
}
