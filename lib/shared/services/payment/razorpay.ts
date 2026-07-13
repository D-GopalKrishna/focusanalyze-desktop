'use client';

interface RazorpayCheckoutBase {
  key: string;
  name: string;
  description: string;
  handler: (response: Record<string, string>) => void | Promise<void>;
  prefill?: {
    name: string;
    email: string;
    contact: string;
  };
  notes?: {
    address: string;
  };
  theme?: {
    color: string;
  };
  modal?: {
    ondismiss: () => void;
  };
}

export interface RazorpayOrderOptions extends RazorpayCheckoutBase {
  amount: number;
  currency: string;
  order_id: string;
}

export interface RazorpaySubscriptionOptions extends RazorpayCheckoutBase {
  subscription_id: string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOrderOptions | RazorpaySubscriptionOptions) => {
      open: () => void;
    };
  }
}

export const resolveRazorpayKeyId = (orderKeyId?: string | null): string => {
  const key = orderKeyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
  if (!key) {
    throw new Error(
      'Razorpay is not configured. Set NEXT_PUBLIC_RAZORPAY_KEY_ID in the frontend environment.',
    );
  }
  return key;
};

export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

const openRazorpayCheckout = async (
  options: RazorpayOrderOptions | RazorpaySubscriptionOptions,
) => {
  const isScriptLoaded = await loadRazorpayScript();
  if (!isScriptLoaded) {
    throw new Error('Razorpay SDK failed to load');
  }
  const razorpay = new window.Razorpay(options);
  razorpay.open();
};

export const initiateRazorpayPayment = async (options: RazorpayOrderOptions) => {
  await openRazorpayCheckout(options);
};

export const initiateRazorpaySubscription = async (options: RazorpaySubscriptionOptions) => {
  await openRazorpayCheckout(options);
};
