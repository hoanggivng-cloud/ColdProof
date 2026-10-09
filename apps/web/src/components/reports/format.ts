export const formatTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : value;
export const shortHash = (value: string) => value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
