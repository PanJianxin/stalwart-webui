/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import zh from './zh.json';

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];
document.documentElement.lang = 'zh-CN';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: 'zh',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLocale(locale: string) {
  // This installation presents a Chinese administration interface, independently of mailbox locale.
  void locale;
  const lang = 'zh';
  i18n.changeLanguage(lang);
  const isRtl = RTL_LANGUAGES.includes(lang);
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
}

export default i18n;
