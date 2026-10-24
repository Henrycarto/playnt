import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import './styles.css';
import { Shell } from './components/Shell';
import { ComplaintPage } from './pages/Complaint';
import { NewComplaint } from './pages/NewComplaint';
import { NotFound } from './pages/NotFound';
import { AuditPage, SourcesPage } from './pages/Other';
import { Queue } from './pages/Queue';
import { Trends } from './pages/Trends';

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Queue /> },
      { path: '/new', element: <NewComplaint /> },
      { path: '/complaints/:id', element: <ComplaintPage /> },
      { path: '/trends', element: <Trends /> },
      { path: '/audit', element: <AuditPage /> },
      { path: '/sources', element: <SourcesPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
