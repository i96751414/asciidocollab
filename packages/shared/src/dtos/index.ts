/** @file Re-exports all DTO types from the shared package. */
export { CreateProjectDto, CreateProjectResultDto } from './create-project.dto';
export { RenameFileDto, RenameFileResultDto } from './rename-file.dto';
export { DeleteFileDto } from './delete-file.dto';
export { InviteUserDto } from './invite-user.dto';
export { RemoveMemberDto } from './remove-member.dto';
export { ChangeMemberRoleDto } from './change-member-role.dto';
export { GetProjectTreeDto, FileTreeNodeDto, GetProjectTreeResultDto } from './get-project-tree.dto';
export {
  RegisterDto,
  LoginDto,
  ChangePasswordDto,
  ResetPasswordDto,
  RequestPasswordResetDto,
  AuthSuccessResponseDto,
  AuthErrorResponseDto,
  UserProfileDto,
  PasswordPolicyDto,
  SetupStatusDto,
  UpdateDisplayNameDto,
  RequestEmailChangeDto,
} from './auth.dto';
export {
  ListUserProjectsResultDto,
  UpdateProjectDto,
  ArchiveProjectResultDto,
  RestoreProjectResultDto,
  ProjectDto,
} from './project-management.dto';
export { UserSearchResultDto } from './user-search.dto';
export {
  AdminUserDto,
  AdminSettingsDto,
  AdminInviteUserDto,
  AcceptInviteDto,
  UserRemovalPreviewDto,
} from './admin.dto';
export { FileTreeEventDto } from './file-tree-event.dto';
export { KeyBindingDto } from './key-binding.dto';
export { EditorPreferencesDto, UpdateEditorPreferencesDto } from './editor-preferences.dto';
