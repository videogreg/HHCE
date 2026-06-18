type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

let listeners: ((toasts: ToastMessage[]) => void)[] = [];
let toasts: ToastMessage[] = [];

const notifyListeners = () => {
  listeners.forEach((fn) => fn([...toasts]));
};

export const showToast = (message: string, type: ToastType = 'success', duration = 4000) => {
  const id = Math.random().toString(36).substring(2, 9);
  const toast: ToastMessage = { id, message, type };
  toasts = [...toasts, toast];
  notifyListeners();

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, duration);
};

export const subscribeToToasts = (callback: (toasts: ToastMessage[]) => void) => {
  listeners.push(callback);
  callback([...toasts]);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
};