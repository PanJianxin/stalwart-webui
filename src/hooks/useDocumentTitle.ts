/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect } from 'react';

import { useTranslation } from 'react-i18next';

export function useDocumentTitle(title?: string | null) {
  const { i18n } = useTranslation();
  const appName = i18n.language.startsWith('en') ? 'Panda Mail Administration' : 'Panda Mail 管理后台';
  useEffect(() => {
    document.title = title ? `${title} · ${appName}` : appName;
    return () => {
      document.title = appName;
    };
  }, [title, appName]);
}
