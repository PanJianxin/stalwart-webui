/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import zh from './zh.json';
import dashboardEn from './dashboard-en.json';
import dashboardZh from './dashboard-zh.json';

const savedLanguage = localStorage.getItem('pandaMailLanguage');
const language = savedLanguage === 'en' ? 'en' : 'zh';
document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en, pandaDashboard: dashboardEn },
    zh: { translation: zh, pandaDashboard: dashboardZh },
  },
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(language: 'zh' | 'en') {
  localStorage.setItem('pandaMailLanguage', language);
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.dir = 'ltr';
  void i18n.changeLanguage(language);
}
export function setLocale(locale: string) {
  // Account locale must not override the explicit administration language choice.
  void locale;
}

export default i18n;
