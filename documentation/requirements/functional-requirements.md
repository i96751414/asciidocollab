# Functional Requirements

## FR-001 Project Management

Users shall be able to:

- Create projects
- Rename projects
- Archive projects (stage 2)
- Delete projects
- Duplicate projects
- Search projects

Project metadata:

- Name
- Description
- Owner
- Tags
- Creation Date
- Last Modified Date


## FR-002 Multifile Project Structure

Support hierarchical projects structures

Capabilities:

- Create folders
- Rename folders
- Drag-and-drop
- Create empty files (asciidoc files or other text files)
- Upload files
- Download files
- Delete files

## FR-003 Asciidoc Editor

Provide a browser editor supporting:

Editing

- Syntax highlighting
- Auto-completion
- Auto-save
- Multi-cursor editing
- Code folding
- Find and replace
- regex search

Language Features

- Attribute completion
- Include resolution
- Cross-reference validation
- Section navigation

Accessibility

- keyboard-only operation
- Adjustable fonts
- High contrast mode

## FR-004 Search

Support search across:

- current file
- current project


## FR-005 Real-time collaboration

Multiple users may edit simultaneously

Capabilities

- Presence indicators
- Cursor following
- Conflict-free editing
- Collaborative undo/redo
- Live updates

## FR-006 HTML Live Preview

Preview shall update automatically

Supported outputs

- HTML5

Features

- side-by-side mode
- full-screen preview


## FR-007 PDF Generation

Support production-quality-PDFs

Rendering engines:

- asciidoctor PDF

Capabilities:

- Theme selection
- Extension selection 

## FR-008 Image Management

Support:

- Drag-and-drop upload
- Image preview
- Version tracking

Formats:

- PNG
- JPEG
- SVG

## FR-009 Templates

Provide reusable templates

Examples:

- Software Architecture Specification
- User Manual
- Release Notes
- Test Approach and Plan

User may create custom templates from existing projects.

## FR-010 GIT integration

Users shall be able to:

Connect repositories

Supported providers:

- bitbucket
- github
- gitlab

These may be hosted at a custom URL.

Capabilities:

- clone repository
- commit changes
- push changes
- pull updates
- branch switch
- merge requests
- pull requests


## FR-011 Project Sandbox

Each project shall be processed independently and have no access to files of other projects or the system unless explicitly allowed.

## FR-012 User Management

User can have one of the following roles:

- viewer
- editor
- administrator

permissions are granted per project

## FR-012 User Authentication

Support:

- Local accounts
- SAML

Single Sign-On

Support:

- entra.microsoft.com

## FR-013 Data Protection

- encryption in transit
- encryption at rest
- secret management

## FR-013 Access Control

- RBAC
- MFA
- Session Management
- IP restrictions