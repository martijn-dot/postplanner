import { forwardRef } from 'react';
import {
  AlertTriangle as AlertTriangleBase,
  ArchiveRestore as ArchiveRestoreBase,
  ArrowRight as ArrowRightBase,
  BarChart3 as BarChart3Base,
  CalendarClock as CalendarClockBase,
  CalendarDays as CalendarDaysBase,
  CalendarPlus as CalendarPlusBase,
  CalendarRange as CalendarRangeBase,
  Camera as CameraBase,
  Check as CheckBase,
  ChevronDown as ChevronDownBase,
  ChevronRight as ChevronRightBase,
  Clock as ClockBase,
  Copy as CopyBase,
  Download as DownloadBase,
  ExternalLink as ExternalLinkBase,
  Eye as EyeBase,
  EyeOff as EyeOffBase,
  FileSpreadsheet as FileSpreadsheetBase,
  FileText as FileTextBase,
  Flag as FlagBase,
  Globe2 as Globe2Base,
  GripVertical as GripVerticalBase,
  KeyRound as KeyRoundBase,
  Link2 as Link2Base,
  Link2Off as Link2OffBase,
  ListChecks as ListChecksBase,
  ListPlus as ListPlusBase,
  LogOut as LogOutBase,
  Menu as MenuBase,
  Package as PackageBase,
  PanelLeftClose as PanelLeftCloseBase,
  PanelLeftOpen as PanelLeftOpenBase,
  Pencil as PencilBase,
  Plus as PlusBase,
  Save as SaveBase,
  Search as SearchBase,
  Send as SendBase,
  Settings as SettingsBase,
  Star as StarBase,
  StickyNote as StickyNoteBase,
  Tag as TagBase,
  Trash2 as Trash2Base,
  UserX as UserXBase,
  Users as UsersBase,
  X as XBase,
  XCircle as XCircleBase,
} from 'lucide-react';

function styledIcon(Icon, displayName) {
  const Component = forwardRef(function AppIcon({ className, ...props }, ref) {
    return (
      <Icon
        ref={ref}
        {...props}
        className={`app-icon${className ? ` ${className}` : ''}`}
        strokeWidth={2.45}
        strokeLinecap="round"
        strokeLinejoin="round"
        absoluteStrokeWidth
      />
    );
  });
  Component.displayName = displayName;
  return Component;
}

export const AlertTriangle = styledIcon(AlertTriangleBase, 'AlertTriangle');
export const ArchiveRestore = styledIcon(ArchiveRestoreBase, 'ArchiveRestore');
export const ArrowRight = styledIcon(ArrowRightBase, 'ArrowRight');
export const BarChart3 = styledIcon(BarChart3Base, 'BarChart3');
export const CalendarClock = styledIcon(CalendarClockBase, 'CalendarClock');
export const CalendarDays = styledIcon(CalendarDaysBase, 'CalendarDays');
export const CalendarPlus = styledIcon(CalendarPlusBase, 'CalendarPlus');
export const CalendarRange = styledIcon(CalendarRangeBase, 'CalendarRange');
export const Camera = styledIcon(CameraBase, 'Camera');
export const Check = styledIcon(CheckBase, 'Check');
export const ChevronDown = styledIcon(ChevronDownBase, 'ChevronDown');
export const ChevronRight = styledIcon(ChevronRightBase, 'ChevronRight');
export const Clock = styledIcon(ClockBase, 'Clock');
export const Copy = styledIcon(CopyBase, 'Copy');
export const Download = styledIcon(DownloadBase, 'Download');
export const ExternalLink = styledIcon(ExternalLinkBase, 'ExternalLink');
export const Eye = styledIcon(EyeBase, 'Eye');
export const EyeOff = styledIcon(EyeOffBase, 'EyeOff');
export const FileSpreadsheet = styledIcon(FileSpreadsheetBase, 'FileSpreadsheet');
export const FileText = styledIcon(FileTextBase, 'FileText');
export const Flag = styledIcon(FlagBase, 'Flag');
export const Globe2 = styledIcon(Globe2Base, 'Globe2');
export const GripVertical = styledIcon(GripVerticalBase, 'GripVertical');
export const KeyRound = styledIcon(KeyRoundBase, 'KeyRound');
export const Link2 = styledIcon(Link2Base, 'Link2');
export const Link2Off = styledIcon(Link2OffBase, 'Link2Off');
export const ListChecks = styledIcon(ListChecksBase, 'ListChecks');
export const ListPlus = styledIcon(ListPlusBase, 'ListPlus');
export const LogOut = styledIcon(LogOutBase, 'LogOut');
export const Menu = styledIcon(MenuBase, 'Menu');
export const Package = styledIcon(PackageBase, 'Package');
export const PanelLeftClose = styledIcon(PanelLeftCloseBase, 'PanelLeftClose');
export const PanelLeftOpen = styledIcon(PanelLeftOpenBase, 'PanelLeftOpen');
export const Pencil = styledIcon(PencilBase, 'Pencil');
export const Plus = styledIcon(PlusBase, 'Plus');
export const Save = styledIcon(SaveBase, 'Save');
export const Search = styledIcon(SearchBase, 'Search');
export const Send = styledIcon(SendBase, 'Send');
export const Settings = styledIcon(SettingsBase, 'Settings');
export const Star = styledIcon(StarBase, 'Star');
export const StickyNote = styledIcon(StickyNoteBase, 'StickyNote');
export const Tag = styledIcon(TagBase, 'Tag');
export const Trash2 = styledIcon(Trash2Base, 'Trash2');
export const UserX = styledIcon(UserXBase, 'UserX');
export const Users = styledIcon(UsersBase, 'Users');
export const X = styledIcon(XBase, 'X');
export const XCircle = styledIcon(XCircleBase, 'XCircle');
