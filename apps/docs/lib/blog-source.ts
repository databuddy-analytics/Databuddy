import { loader } from 'fumadocs-core/source';
import { blogs } from '@/.source';

// Blog source configuration
export const blogSource = loader({
  baseUrl: '/blog',
  source: blogs.toFumadocsSource(),
});
