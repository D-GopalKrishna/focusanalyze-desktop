export type StartingCreateProjectComponentProps = {
  setCurrentSection: (section: 'create' | 'integrate' | 'import') => void;
};

export type ProjectCreationSection = 'main' | 'create' | 'integrate' | 'import';

export type ProjectViewType = 'board' | 'list' | 'all-track';
