import { supabase } from './supabase';

// VAPID 공개 키 (실제로는 환경 변수로 관리해야 함)
// 이 키는 예시이며, 실제 프로덕션에서는 Supabase 프로젝트 설정에서 가져와야 합니다
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 
  'BEl62iUYgUivxIkv69yViEuiBIa40HI8v7V3V2A2uBZg5HvVz8J4N7k1F3G5H6J8K9L0M1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4';

// 푸시 알림 구독 요청
export async function requestPushNotificationPermission(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push messaging is not supported');
    return null;
  }

  try {
    // Service Worker 등록
    const registration = await navigator.serviceWorker.ready;
    
    // 이미 구독되어 있는지 확인
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log('Already subscribed to push notifications');
      return existingSubscription;
    }
    
    // 알림 권한 요청
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    // 푸시 구독
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    console.log('Push subscription created:', subscription);
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
}

// VAPID 키를 Uint8Array로 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 푸시 구독 정보를 Supabase에 저장
export async function savePushSubscription(subscription: PushSubscription, userId: string): Promise<boolean> {
  try {
    const subscriptionData = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
      auth: arrayBufferToBase64(subscription.getKey('auth')!),
    };

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'endpoint',
      });

    if (error) {
      console.error('Error saving push subscription:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    return false;
  }
}

// ArrayBuffer를 Base64로 변환
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// 자녀용 푸시 구독 저장 (childId를 user_id로 사용)
export async function saveChildPushSubscription(
  subscription: PushSubscription,
  childId: string
): Promise<boolean> {
  try {
    const subscriptionData = {
      user_id: childId, // 자녀의 ID를 user_id로 사용 (임시)
      endpoint: subscription.endpoint,
      p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
      auth: arrayBufferToBase64(subscription.getKey('auth')!),
    };

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'endpoint',
      });

    if (error) {
      console.error('Error saving child push subscription:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error saving child push subscription:', error);
    return false;
  }
}

// 푸시 알림 초기화 (앱 시작 시 호출)
export async function initializePushNotifications(userId: string, isChild: boolean = false): Promise<void> {
  try {
    const subscription = await requestPushNotificationPermission();
    if (subscription) {
      if (isChild) {
        await saveChildPushSubscription(subscription, userId);
      } else {
        await savePushSubscription(subscription, userId);
      }
      console.log('Push notifications initialized');
    }
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

// Edge Function을 통해 푸시 알림 전송
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        userId,
        title,
        body,
        url: url || '/',
      },
    });

    if (error) {
      console.error('Error sending push notification:', error);
      return false;
    }

    return data?.success || false;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
}

