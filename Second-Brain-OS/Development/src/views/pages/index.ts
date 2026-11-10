import type { PageDef } from '../context';
import { HomePage } from './home';
import { TasksPage, TodayPage } from './tasks';
import { ProjectPage, ProjectsPage } from './projects';
import { WorklogsPage } from './worklogs';
import { KnowledgePage, NotePage } from './knowledge';
import { GoalPage, GoalsPage } from './goals';
import { ArchivePage, JournalPage, LearningPage } from './misc';
import { ReviewSessionPage, ReviewsPage } from './reviews';

/** Page registry. Adding a module = adding a PageDef here + a NAV entry. */
export const PAGES: Record<string, PageDef> = {
  home: HomePage,
  today: TodayPage,
  tasks: TasksPage,
  worklogs: WorklogsPage,
  knowledge: KnowledgePage,
  note: NotePage,
  projects: ProjectsPage,
  project: ProjectPage,
  goals: GoalsPage,
  goal: GoalPage,
  learning: LearningPage,
  journal: JournalPage,
  reviews: ReviewsPage,
  review: ReviewSessionPage,
  archive: ArchivePage,
};
