import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Cadastro from "./pages/Cadastro.tsx";
import ProfessionalLanding from "./pages/ProfessionalLanding.tsx";
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
import PatientBuscar from "./pages/paciente/PatientBuscar.tsx";
import PatientAgendamentos from "./pages/paciente/PatientAgendamentos.tsx";
import PatientAgendar from "./pages/paciente/PatientAgendar.tsx";
import PatientPerfil from "./pages/paciente/PatientPerfil.tsx";

const queryClient = new QueryClient();

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute requiredRole="professional">
    <DashboardLayout>{children}</DashboardLayout>
  </ProtectedRoute>
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
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            {/* Protected patient routes */}
            <Route path="/minha-conta" element={<PatientRoute><PatientBuscar /></PatientRoute>} />
            <Route path="/minha-conta/agendamentos" element={<PatientRoute><PatientAgendamentos /></PatientRoute>} />
            <Route path="/minha-conta/agendar/:slug" element={<PatientRoute><PatientAgendar /></PatientRoute>} />
            <Route path="/minha-conta/perfil" element={<PatientRoute><PatientPerfil /></PatientRoute>} />
            {/* Protected professional routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/perfil" element={<AdminRoute><AdminPerfil /></AdminRoute>} />
            <Route path="/admin/artigos" element={<AdminRoute><AdminArtigos /></AdminRoute>} />
            <Route path="/admin/videos" element={<AdminRoute><AdminVideos /></AdminRoute>} />
            <Route path="/admin/leads" element={<AdminRoute><AdminLeads /></AdminRoute>} />
            <Route path="/admin/configuracoes" element={<AdminRoute><AdminConfiguracoes /></AdminRoute>} />
            <Route path="/admin/disponibilidade" element={<AdminRoute><AdminDisponibilidade /></AdminRoute>} />
            {/* Dynamic professional landing page - MUST be last before catch-all */}
            <Route path="/:slug" element={<ProfessionalLanding />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
