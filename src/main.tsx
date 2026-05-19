import React from 'react';
import ReactDOM from 'react-dom/client';

import { AppStoreProvider } from '@/store';
import { defaultState } from '@/store/app-store';
import { RouterProvider } from '@/app/router';
import { PersistenceProvider } from '@/app/PersistenceProvider';
import { Shell } from '@/app/Shell';

import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStoreProvider initialState={{ ...defaultState }}>
      <PersistenceProvider>
        <RouterProvider>
          <Shell />
        </RouterProvider>
      </PersistenceProvider>
    </AppStoreProvider>
  </React.StrictMode>
);
