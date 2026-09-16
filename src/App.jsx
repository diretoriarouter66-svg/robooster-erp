import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Acessos from '@/pages/Acessos';
import Login from '@/pages/Login';
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
import BaseInstalada from './pages/BaseInstalada';
import Manual from './pages/Manual';
import Stock from './pages/Stock';
import Financial from './pages/Financial';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ImportSimulator from './pages/ImportSimulator';
import DRE from './pages/DRE';
import Breakeven from './pages/Breakeven';
import ContainerPage from './pages/Container';
import ConfigTributaria from './pages/ConfigTributaria';
import ServiceOrders from './pages/ServiceOrders';
import NotasFiscais from './pages/NotasFiscais';
import EstoqueCaixa from './pages/EstoqueCaixa';
import MLCallback from './pages/MLCallback';
import Patrimonio from './pages/Patrimonio';
import Sites from './pages/Sites';
import RequireModulo from '@/components/RequireModulo';

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
      {/* Cadastro é fechado: usuários nascem pela tela de Contatos (admin) */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {/* Popup do OAuth do Mercado Livre — sem o layout com sidebar */}
        <Route path="/ml-callback" element={<MLCallback />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<RequireModulo modulo="produtos"><Products /></RequireModulo>} />
          <Route path="/acessos" element={<Acessos />} />
          <Route path="/suppliers" element={<RequireModulo modulo="contatos"><Contatos /></RequireModulo>} />
          <Route path="/contatos" element={<RequireModulo modulo="contatos"><Contatos /></RequireModulo>} />
          <Route path="/customers" element={<RequireModulo modulo="contatos"><Contatos /></RequireModulo>} />
          <Route path="/sales-channels" element={<RequireModulo modulo="comercial"><SalesChannels /></RequireModulo>} />
          <Route path="/categorias" element={<RequireModulo modulo="produtos"><Categorias /></RequireModulo>} />
          <Route path="/precificacao" element={<RequireModulo modulo="precificador"><Precificacao /></RequireModulo>} />

          <Route path="/purchase-orders" element={<RequireModulo modulo="custos"><PurchaseOrders /></RequireModulo>} />
          <Route path="/sale-orders" element={<RequireModulo modulo="comercial"><SaleOrders /></RequireModulo>} />
          <Route path="/ordens-servico" element={<RequireModulo modulo="servicos"><ServiceOrders /></RequireModulo>} />
          <Route path="/notas-fiscais" element={<RequireModulo modulo="custos"><NotasFiscais /></RequireModulo>} />
          <Route path="/estoque-caixa" element={<RequireModulo modulo="custos"><EstoqueCaixa /></RequireModulo>} />
          <Route path="/patrimonio" element={<RequireModulo modulo="custos"><Patrimonio /></RequireModulo>} />
          <Route path="/base-instalada" element={<RequireModulo modulo="comercial"><BaseInstalada /></RequireModulo>} />
          <Route path="/manual" element={<Manual />} />
          <Route path="/stock" element={<RequireModulo modulo="estoque"><Stock /></RequireModulo>} />
          <Route path="/financial" element={<RequireModulo modulo="financeiro"><Financial /></RequireModulo>} />
          <Route path="/reports" element={<RequireModulo modulo="financeiro"><Reports /></RequireModulo>} />
          <Route path="/import-simulator" element={<RequireModulo modulo="importacao"><ImportSimulator /></RequireModulo>} />
          <Route path="/dre" element={<RequireModulo modulo="financeiro"><DRE /></RequireModulo>} />
          <Route path="/sites" element={<RequireModulo modulo="comercial"><Sites /></RequireModulo>} />
          <Route path="/breakeven" element={<RequireModulo modulo="financeiro"><Breakeven /></RequireModulo>} />
          <Route path="/container" element={<RequireModulo modulo="importacao"><ContainerPage /></RequireModulo>} />
          <Route path="/config-tributaria" element={<RequireModulo modulo="config"><ConfigTributaria /></RequireModulo>} />
          <Route path="/settings" element={<RequireModulo modulo="config"><Settings /></RequireModulo>} />
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
        <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App