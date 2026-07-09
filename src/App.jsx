import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';

import Contatos from './pages/Contatos';
import SalesChannels from './pages/SalesChannels';
import Categorias from './pages/Categorias';
import Precificacao from './pages/Precificacao';

import PurchaseOrders from './pages/PurchaseOrders';
import SaleOrders from './pages/SaleOrders';
import Stock from './pages/Stock';
import Financial from './pages/Financial';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ImportSimulator from './pages/ImportSimulator';
import DRE from './pages/DRE';
import Breakeven from './pages/Breakeven';
import ContainerPage from './pages/Container';
import ConfigTributaria from './pages/ConfigTributaria';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/suppliers" element={<Contatos />} />
          <Route path="/contatos" element={<Contatos />} />
          <Route path="/customers" element={<Contatos />} />
          <Route path="/sales-channels" element={<SalesChannels />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/precificacao" element={<Precificacao />} />

          <Route path="/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/sale-orders" element={<SaleOrders />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/financial" element={<Financial />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/import-simulator" element={<ImportSimulator />} />
          <Route path="/dre" element={<DRE />} />
          <Route path="/breakeven" element={<Breakeven />} />
          <Route path="/container" element={<ContainerPage />} />
          <Route path="/config-tributaria" element={<ConfigTributaria />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App