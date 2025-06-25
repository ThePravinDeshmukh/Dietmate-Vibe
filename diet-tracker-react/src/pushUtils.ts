// Helper to convert a URL-safe base64 VAPID key to a Uint8Array for push subscription
export function urlBase64ToUint8Array(base64String: string) {
  // Remove any whitespace or newlines
  base64String = base64String.replace(/\s/g, '');
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
