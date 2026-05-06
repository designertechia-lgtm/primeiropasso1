import {
  LayoutDashboard,
  User,
  FileText,
  Video,
  LayoutList,
  Settings,
  CalendarDays,
  FileUp,
  Clapperboard,
  Monitor,
  Share2,
  Drama,
  CreditCard,
  Crown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
  { title: "Minha Página", url: "/admin/landing", icon: Monitor },
  { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { title: "CRM Leads", url: "/admin/clientes", icon: LayoutList },
  { title: "Artigos", url: "/admin/artigos", icon: FileText },
  { title: "Vídeos", url: "/admin/videos", icon: Video },
  { title: "Criar Vídeo",     url: "/admin/criar-video",    icon: Clapperboard },
  { title: "Personagens",     url: "/admin/avatares",        icon: Drama        },
  { title: "Redes Sociais",   url: "/admin/redes-sociais",  icon: Share2       },
  { title: "Documentos", url: "/admin/documentos", icon: FileUp },
  { title: "Assinatura", url: "/admin/assinatura", icon: CreditCard },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

export function DashboardSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isOwner } = useAuth();

  const visibleItems = isOwner
    ? [...items, { title: "Gerente", url: "/admin-gerente", icon: Crown }]
    : items;

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
              {visibleItems.map((item) => (
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
