'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const dismissed = localStorage.getItem('mozhyper-install-dismissed');
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    setIos(isIos);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      if (!dismissed) setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    if (isIos && !dismissed) setShow(true);

    const timer = window.setTimeout(() => {
      if (!dismissed && (isIos || installEvent)) setShow(true);
    }, 1200);

    const onInstalled = () => setShow(false);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  const close = () => {
    localStorage.setItem('mozhyper-install-dismissed', '1');
    setShow(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    setShow(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-4 z-[9999] mx-auto max-w-sm rounded-2xl border border-sky-400/30 bg-[#07111f]/95 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <img src="/mozhyper-icon.svg" alt="MozHyper" className="h-12 w-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold">Instale o MozHyper</div>
          <div className="mt-1 text-sm text-slate-300">
            Tenha acesso rápido ao MozHyper diretamente da tela inicial do seu celular.
          </div>
        </div>
        <button onClick={close} aria-label="Fechar" className="text-xl leading-none text-slate-400">×</button>
      </div>

      {ios ? (
        <div className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-slate-200">
          No iPhone: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.
        </div>
      ) : (
        <button onClick={install} className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-400">
          Instalar APP
        </button>
      )}
      <button onClick={close} className="mt-2 w-full py-2 text-xs text-slate-400">Agora não</button>
    </div>
  );
}
