import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import OwnerRoute from "@/components/OwnerRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Cadastro from "./pages/Cadastro.tsx";
import Reset from "./pages/Reset.tsx";
import ProfessionalLanding from "./pages/ProfessionalLanding.tsx";
import ArticlePage from "./pages/ArticlePage.tsx";
import ArticlesListPage from "./pages/ArticlesListPage.tsx";
import VideosListPage from "./pages/VideosListPage.tsx";
import VideoPage from "./pages/VideoPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import PatientLayout from "./components/dashboard/PatientLayout.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminPerfil from "./pages/admin/AdminPerfil.tsx";
import AdminArtigos from "./pages/admin/AdminArtigos.tsx";
import AdminVideos from "./pages/admin/AdminVideos.tsx";
import AdminLeads from "./pages/admin/AdminLeads.tsx";
import AdminConfiguracoes from "./pages/admin/AdminConfiguracoes.tsx";
import AdminDisponibilidade from "./pages/admin/AdminDisponibilidade.tsx";
import AdminAgendamentos from "./pages/admin/AdminAgendamentos.tsx";
import AdminAgenda from "./pages/admin/AdminAgenda.tsx";
import AdminDocumentos from "./pages/admin/AdminDocumentos.tsx";
import AdminCriarVideo from "./pages/admin/AdminCriarVideo.tsx";
import AdminLandingPage from "./pages/admin/AdminLandingPage.tsx";
import AdminRedesSociais from "./pages/admin/AdminRedesSociais.tsx";
import AdminAvatares from "./pages/admin/AdminAvatares.tsx";
import AdminClientes from "./pages/admin/AdminClientes.tsx";
import AdminAssinatura from "./pages/admin/AdminAssinatura.tsx";
import AdminGerente from "./pages/admin/AdminGerente.tsx";
import AdminFeedback from "./pages/admin/AdminFeedback.tsx";
import AdminAxelChat from "./pages/admin/AdminAxelChat.tsx";
import AdminTrafegoPago from "./pages/admin/AdminTrafegoPago.tsx";

import PatientBuscar from "./pages/paciente/PatientBuscar.tsx";
import PatientAgendamentos from "./pages/paciente/PatientAgendamentos.tsx";
import PatientAgendar from "./pages/paciente/PatientAgendar.tsx";
import PatientPerfil from "./pages/paciente/PatientPerfil.tsx";
import FaviconUpdater from "./components/FaviconUpdater.tsx";
import AppAnnouncements from "./components/AppAnnouncements.tsx";
import RouteErrorBoundary from "./components/ErrorBoundary.tsx";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requiredRole="professional">
    <DashboardLayout>{children}</DashboardLayout>
  </ProtectedRoute>
);

const OwnerOnlyRoute = ({ children }: { children: React.ReactNode }) => (
  <OwnerRoute>
    <DashboardLayout>{children}</DashboardLayout>
  </OwnerRoute>
);

const PatientRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requiredRole="patient">
    <PatientLayout>{children}</PatientLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FaviconUpdater />
          <AppAnnouncements />
          <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/reset" element={<Reset />} />
            {/* Protected patient routes */}
            <Route path="/minha-conta" element={<PatientRoute><PatientBuscar /></PatientRoute>} />
            <Route path="/minha-conta/agendamentos" element={<PatientRoute><PatientAgendamentos /></PatientRoute>} />
            <Route path="/minha-conta/agendar/:slug" element={<PatientRoute><PatientAgendar /></PatientRoute>} />
            <Route path="/minha-conta/perfil" element={<PatientRoute><PatientPerfil /></PatientRoute>} />
            {/* Protected professional routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/perfil" element={<AdminRoute><AdminPerfil /></AdminRoute>} />
            <Route path="/admin/artigos" element={<Navigate to="/admin/redes-sociais?tab=artigos" replace />} />
            <Route path="/admin/videos" element={<Navigate to="/admin/redes-sociais?tab=videos" replace />} />
            <Route path="/admin/clientes" element={<AdminRoute><AdminClientes /></AdminRoute>} />
            {/* Redirect da rota antiga para tab Novos Leads */}
            <Route path="/admin/leads" element={<Navigate to="/admin/clientes?tab=novos" replace />} />
            <Route path="/admin/configuracoes" element={<AdminRoute><AdminConfiguracoes /></AdminRoute>} />
            <Route path="/admin/agenda" element={<AdminRoute><AdminAgenda /></AdminRoute>} />
            {/* Redirects das rotas antigas para tabs da Agenda */}
            <Route path="/admin/agendamentos" element={<Navigate to="/admin/agenda?tab=agendamentos" replace />} />
            <Route path="/admin/disponibilidade" element={<Navigate to="/admin/agenda?tab=bloqueios" replace />} />
            <Route path="/admin/documentos" element={<Navigate to="/admin/redes-sociais?tab=rag" replace />} />
            <Route path="/admin/criar-video" element={<Navigate to="/admin/redes-sociais?tab=criar-video" replace />} />
            <Route path="/admin/landing" element={<AdminRoute><AdminLandingPage /></AdminRoute>} />
            <Route path="/admin/redes-sociais" element={<AdminRoute><AdminRedesSociais /></AdminRoute>} />
            <Route path="/admin/avatares" element={<Navigate to="/admin/redes-sociais?tab=personagens" replace />} />
            <Route path="/admin/assinatura" element={<AdminRoute><AdminAssinatura /></AdminRoute>} />
            <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />
            <Route path="/admin/chat" element={<AdminRoute><AdminAxelChat /></AdminRoute>} />
            <Route path="/admin/trafego-pago" element={<AdminRoute><AdminTrafegoPago /></AdminRoute>} />
            <Route path="/admin-gerente" element={<OwnerOnlyRoute><AdminGerente /></OwnerOnlyRoute>} />
            <Route path="/admin-proprietario" element={<Navigate to="/admin-gerente" replace />} />

            {/* Dynamic professional landing page - MUST be last before catch-all */}
            <Route path="/:slug" element={<ProfessionalLanding />} />
            <Route path="/:slug/artigos" element={<ArticlesListPage />} />
            <Route path="/:slug/artigo/:articleSlug" element={<ArticlePage />} />
            <Route path="/:slug/videos" element={<VideosListPage />} />
            <Route path="/:slug/video/:videoId" element={<VideoPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </RouteErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
