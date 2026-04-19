import {
  LayoutDashboard,
  User,
  FileText,
  Video,
  Users,
  Settings,
  Clock,
  Calendar,
  CalendarDays,
  ClockIcon,
  FileUp,
  Ban,
  Clapperboard,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Painel", url: "/admin", icon: LayoutDashboard },
  { title: "Meu Perfil", url: "/admin/perfil", icon: User },
  { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { title: "Agendamentos", url: "/admin/agendamentos", icon: Calendar },
  { title: "Bloqueios", url: "/admin/disponibilidade", icon: Ban },
  { title: "Novos Pacientes", url: "/admin/leads", icon: Users },
  { title: "Artigos", url: "/admin/artigos", icon: FileText },
  { title: "Vídeos", url: "/admin/videos", icon: Video },
  { title: "Criar Vídeo", url: "/admin/criar-video", icon: Clapperboard },
  { title: "Documentos", url: "/admin/documentos", icon: FileUp },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

export function DashboardSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Primeiro Passo"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/admin"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                      onClick={handleNavClick}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
