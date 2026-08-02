export function canEditSpace(remoteMode: boolean, dataReady: boolean): boolean {
  return !remoteMode || dataReady;
}

export function readRelationshipStart(formData: FormData): string | null {
  const value = formData.get('relationship-start');
  return typeof value === 'string' && value ? value : null;
}
