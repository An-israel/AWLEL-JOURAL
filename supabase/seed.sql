-- =============================================================================
-- AWLEL seed data
--   * site settings, feature flags
--   * subject categories
--   * editorial board (from the 2019 issue, flagged "to be verified")
--   * static page placeholders (text inside <mark> is to be replaced)
--   * ONE SAMPLE ISSUE with three SAMPLE ARTICLES for previewing the design.
--     They are fictional. Delete them from the admin before launch.
--
-- Idempotent: safe to run more than once against the same database.
-- =============================================================================

insert into public.site_settings (id, journal_name, journal_short_name, subtitle, issn, publisher,
  contact_email, postal_address, publication_frequency, social_links)
values (1,
  'African, World Literature and English Language',
  'AWLEL',
  'University of Nigeria Journal of Language and Literary Studies',
  '2315-5493',
  'Department of English and Literary Studies, University of Nigeria, Nsukka',
  'awlel.journal@gmail.com',
  'Department of English and Literary Studies, University of Nigeria, Nsukka, Enugu State, Nigeria',
  null,
  '{}'::jsonb)
on conflict (id) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('submissions_open', true, 'Authors can submit new manuscripts through /submit.'),
  ('reviewer_module', true, 'Reviewer queue and review forms are available.'),
  ('home_most_read', true, 'Show the "Most read" and "Most downloaded" section on the home page.'),
  ('google_sign_in', false, 'Show "Sign in with Google" (requires the Google provider in Supabase Auth).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order) values
  ('African Literature', 'african-literature',
   'Criticism and scholarship on written literatures of Africa and the African diaspora.', 10),
  ('World Literature', 'world-literature',
   'Comparative and transnational studies of literatures beyond Africa.', 20),
  ('English Language', 'english-language',
   'Studies of English in use, including varieties of English, stylistics and pedagogy.', 30),
  ('Linguistics', 'linguistics',
   'Descriptive, theoretical and applied linguistics, including African languages.', 40),
  ('Drama and Theatre Studies', 'drama-and-theatre-studies',
   'Dramatic literature, performance and theatre practice.', 50),
  ('Poetry', 'poetry',
   'Studies of poetry and poetics across traditions and periods.', 60),
  ('Literary Theory and Criticism', 'literary-theory-and-criticism',
   'Theoretical approaches to literature and critical method.', 70),
  ('Oral Literature and Folklore', 'oral-literature-and-folklore',
   'Orature, folklore, verbal arts and performance traditions.', 80),
  ('Translation Studies', 'translation-studies',
   'Theory and practice of translation between languages and cultures.', 90),
  ('Cultural Studies', 'cultural-studies',
   'Literature and language in relation to culture, media and society.', 100)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Editorial board (2019 issue — every entry flagged needs_verification)
-- ---------------------------------------------------------------------------
insert into public.editorial_board_groups (name, sort_order) values
  ('Editor', 10), ('Editorial Team', 20), ('Editorial Consultants', 30)
on conflict (name) do nothing;

insert into public.editorial_board_members (group_id, name, title, affiliation, sort_order, needs_verification)
select g.id, m.name, m.title, m.affiliation, m.sort_order, true
from (values
  ('Editor', 'Prof. T. M. E. Chukwumezie', 'Editor-in-Chief',
     'Department of English and Literary Studies, University of Nigeria, Nsukka', 10),
  ('Editorial Team', 'C. F. Ononye', null, null, 10),
  ('Editorial Team', 'O. M. Melefa', null, null, 20),
  ('Editorial Team', 'O. A. Ejesu', null, null, 30),
  ('Editorial Consultants', 'Professor Ebele Oseye', null, 'Department of English, Pace University, USA', 10),
  ('Editorial Consultants', 'Professor Ernest Emenyonu', null, 'University of Michigan at Flint, USA', 20),
  ('Editorial Consultants', 'Professor Aloysius Ohaegbu', null, 'Department of Foreign Languages, University of Nigeria, Nsukka', 30),
  ('Editorial Consultants', 'Professor Akachi Adimora-Ezeigbo', null, 'Department of English and Literary Studies, University of Lagos, Nigeria', 40),
  ('Editorial Consultants', 'Professor L. C. Ogenyi', null, 'Use of English Unit, University of Nigeria, Nsukka', 50),
  ('Editorial Consultants', 'Professor Ozo-mekuri Ndimele', null, 'Department of Linguistics and Communication Studies, University of Port Harcourt, Nigeria', 60),
  ('Editorial Consultants', 'Professor A. N. Akwanya', null, 'Department of English and Literary Studies, University of Nigeria, Nsukka', 70),
  ('Editorial Consultants', 'Professor Sam Ukala', 'Provost', 'Delta State University, Asaba Campus, Nigeria', 80),
  ('Editorial Consultants', 'Professor Abioseh Porter', null, 'English and Philosophy, Drexel University, USA', 90),
  ('Editorial Consultants', 'Professor I. T. K. Egonu', null, 'Department of Foreign Languages and Literary Studies, University of Nigeria, Nsukka', 100),
  ('Editorial Consultants', 'Professor Mary Kolawole', null, 'Department of Languages and Literature, Kwara State University, Nigeria', 110),
  ('Editorial Consultants', 'Professor Sam Onuigbo', null, 'Department of English and Literary Studies, University of Nigeria, Nsukka', 120),
  ('Editorial Consultants', 'Dr. Virgy Anohu', null, 'Mortgage Guaranty Savings and Loans, Abuja', 130),
  ('Editorial Consultants', 'Professor Ebele Eko', null, 'Department of English and Literary Studies, University of Calabar, Nigeria', 140),
  ('Editorial Consultants', 'Professor Ifenyinwa Ogbazi', null, 'Department of English Language and Literature, Nnamdi Azikiwe University, Nigeria', 150),
  ('Editorial Consultants', 'Professor Ibrahim Bello-Kano', null, 'Department of English, Bayero University, Kano, Nigeria', 160),
  ('Editorial Consultants', 'Professor F. O. Orabueze', null, 'Department of English and Literary Studies, University of Nigeria, Nsukka', 170)
) as m (group_name, name, title, affiliation, sort_order)
join public.editorial_board_groups g on g.name = m.group_name
where not exists (select 1 from public.editorial_board_members e where e.name = m.name);

-- ---------------------------------------------------------------------------
-- Static pages. Anything inside <mark> is a placeholder to replace in the
-- admin; needs_review stays true until a Super Admin clears it.
-- ---------------------------------------------------------------------------
insert into public.pages (slug, title, meta_description, needs_review, content) values
('scope', 'Aims and Scope',
 'The aims and scope of AWLEL: African, World Literature and English Language.',
 true,
$html$<p><em>African, World Literature and English Language</em> (AWLEL) is a forum for scholars publishing on the African literary and linguistic experience and on issues in global English language and literary studies. The journal is published by the Department of English and Literary Studies, University of Nigeria, Nsukka.</p>
<h2>Aims</h2>
<p>AWLEL publishes rigorous, original scholarship that advances the study of literature and language in Africa and in the wider world. It brings research on African writing, orature and languages into conversation with work on world literatures and on English as a global language.</p>
<h2>Scope</h2>
<p>The journal welcomes work in the following subject areas:</p>
<ul>
<li>African literature, written and oral</li>
<li>World and comparative literature</li>
<li>English language studies, including stylistics and varieties of English</li>
<li>Linguistics, including African languages</li>
<li>Drama and theatre studies</li>
<li>Poetry and poetics</li>
<li>Literary theory and criticism</li>
<li>Oral literature and folklore</li>
<li>Translation studies</li>
<li>Cultural studies</li>
</ul>
<h2>Types of submission</h2>
<p>AWLEL accepts original research articles. <mark>[To be confirmed: whether the journal also accepts review essays, book reviews or interviews.]</mark></p>$html$),

('submission-guidelines', 'Submission Guidelines',
 'How to prepare and submit a manuscript to AWLEL.',
 true,
$html$<p>Thank you for considering <em>African, World Literature and English Language</em> for your work. Please read these guidelines carefully before you submit. Manuscripts that do not follow them may be returned without review.</p>
<h2>Manuscript structure</h2>
<p>Every manuscript must be organised under the following headings, in this order:</p>
<ol>
<li>Abstract</li>
<li>Introduction</li>
<li>Literature Review (one or two subsections)</li>
<li>Theoretical Framework</li>
<li>Methodology</li>
<li>Data Presentation</li>
<li>Analysis / Findings</li>
<li>Conclusion</li>
<li>Works Cited (MLA 8th edition) <strong>or</strong> References (APA 7th edition)</li>
</ol>
<h2>Formatting</h2>
<ul>
<li>Prepare the manuscript in an <strong>indented paragraphing style</strong>.</li>
<li>Submit the manuscript as a Word document (.docx).</li>
<li>Length: <mark>[To be confirmed: word count limits, for example 5,000–8,000 words including references.]</mark></li>
<li>Font and spacing: <mark>[To be confirmed: font, size and line spacing requirements.]</mark></li>
</ul>
<h2>Citation style</h2>
<p>Use <strong>one</strong> citation style consistently throughout the paper: either the MLA 8th edition, with a list headed “Works Cited”, or the APA 7th edition, with a list headed “References”. Do not mix the two styles.</p>
<h2>Review process</h2>
<p><mark>[To be confirmed: review model and timeline, for example “All manuscripts undergo double-blind peer review. Authors normally receive a decision within N weeks.”]</mark></p>
<h2>Fees</h2>
<p><mark>[To be confirmed: any submission or publication fees, or a statement that there are none.]</mark></p>$html$),

('about', 'About the Journal',
 'History, publisher, policies and indexing of AWLEL.',
 true,
$html$<h2>History</h2>
<p><em>African, World Literature and English Language</em> (AWLEL) was founded in 2001 by the Department of English and Literary Studies, University of Nigeria, Nsukka. It was first published as <em>Africa and World Literature</em> (AWL) and later became AWLEL, reflecting its widened scope across literature and the English language.</p>
<h2>Publisher</h2>
<p>Department of English and Literary Studies, University of Nigeria, Nsukka, Enugu State, Nigeria.</p>
<h2>ISSN</h2>
<p>2315-5493</p>
<h2>Publication frequency</h2>
<p><mark>[To be confirmed: publication frequency, for example “one volume per year, published in one or more issues”.]</mark></p>
<h2>Peer review policy</h2>
<p>All research articles undergo double-blind peer review: reviewers do not know the identity of authors, and authors do not know the identity of reviewers. <mark>[To be confirmed by the Editor.]</mark></p>
<h2>Open access</h2>
<p>All articles published in AWLEL are free to read and download, without registration or charge.</p>
<h2>Copyright and licensing</h2>
<p><mark>[To be confirmed: proposed licence is Creative Commons Attribution 4.0 International (CC BY 4.0), under which authors retain copyright and anyone may share and adapt the work with attribution.]</mark></p>
<h2>Publication ethics</h2>
<p>AWLEL is committed to the principles of the Committee on Publication Ethics (COPE). <mark>[To be confirmed: full statement on authorship, plagiarism, conflicts of interest, corrections and retractions.]</mark></p>
<h2>Indexing</h2>
<p><mark>[To be confirmed: databases and indexes in which AWLEL is listed.]</mark></p>$html$),

('department', 'The Department',
 'The Department of English and Literary Studies, University of Nigeria, Nsukka.',
 true,
$html$<p>AWLEL is published by the Department of English and Literary Studies at the University of Nigeria, Nsukka.</p>
<h2>History of the Department</h2>
<p><mark>[Placeholder: a history of the Department of English and Literary Studies, from its founding to the present. Replace this text from the admin — do not publish until verified.]</mark></p>
<h2>The Department and the journal</h2>
<p><mark>[Placeholder: how the Department founded and sustains the journal.]</mark></p>$html$),

('contact', 'Contact Us',
 'Contact the editorial office of AWLEL.',
 false,
$html$<p>For enquiries about submissions, published articles or the journal, write to the editorial office.</p>$html$),

('privacy', 'Privacy Policy',
 'How AWLEL handles personal information.',
 true,
$html$<p><mark>[Placeholder: privacy policy. It should cover account data for authors and reviewers, contact form messages, anonymous usage statistics (no personal data is stored; views and downloads are counted using a hashed session identifier), cookies used for signing in, and how to request deletion of personal data.]</mark></p>$html$)
on conflict (slug) do nothing;

insert into public.department_milestones (year_label, title, description, sort_order, needs_verification)
select * from (values
  ('[Year]', '[Placeholder] Department founded', 'Replace with verified history.', 10, true),
  ('2001', 'AWL founded', 'The Department founds the journal, first published as Africa and World Literature (AWL).', 20, false),
  ('[Year]', '[Placeholder] Journal renamed AWLEL', 'Replace with the year the journal became African, World Literature and English Language.', 30, true)
) as v (year_label, title, description, sort_order, needs_verification)
where not exists (select 1 from public.department_milestones);

-- ---------------------------------------------------------------------------
-- SAMPLE CONTENT — fictional, for previewing the design. Delete before launch.
-- ---------------------------------------------------------------------------
insert into public.volumes (id, volume_number, year)
values ('00000000-0000-4000-8000-000000000026', 26, 2026)
on conflict (volume_number) do nothing;

insert into public.issues (id, volume_id, issue_number, month, title, editorial, published_at, status)
values ('00000000-0000-4000-8000-000000002601',
        '00000000-0000-4000-8000-000000000026', 1, 6,
        'Sample Issue — replace before launch',
        $html$<p>This is a <strong>sample issue</strong> created by the seed script so the design can be reviewed with content in place. Its articles are fictional. Delete this issue from the admin before launch.</p>$html$,
        '2026-06-30 09:00:00+01', 'published')
on conflict (volume_id, issue_number) do nothing;

insert into public.articles (id, issue_id, category_id, title, slug, abstract, keywords,
  first_page, last_page, citation_style, sort_order, status, published_at)
select v.id::uuid, '00000000-0000-4000-8000-000000002601', c.id, v.title, v.slug, v.abstract,
       v.keywords, v.first_page, v.last_page, v.style::public.citation_style, v.sort_order,
       'published', '2026-06-30 09:00:00+01'
from (values
  ('00000000-0000-4000-8000-000000260101', 'african-literature',
   'Memory, Migration and the Postcolonial Archive in Contemporary Nigerian Fiction',
   'sample-memory-migration-and-the-postcolonial-archive',
   $html$<p><strong>Sample article.</strong> This study examines how contemporary Nigerian novels figure migration as an act of memory. Drawing on theories of the archive and of postcolonial testimony, it reads selected novels as counter-archives that preserve experiences excluded from official records. The analysis shows that the novels' fragmented narration enacts the gaps of the colonial archive while inviting readers to participate in acts of recovery. The paper concludes that fiction serves as a vital supplement to the historical record of Nigerian migration.</p>$html$,
   array['memory', 'migration', 'postcolonial archive', 'Nigerian fiction'], 1, 18, 'mla8', 10),
  ('00000000-0000-4000-8000-000000260102', 'linguistics',
   'Code-Switching and Identity in Igbo–English Conversations on Nigerian Campuses',
   'sample-code-switching-and-identity-in-igbo-english-conversations',
   $html$<p><strong>Sample article.</strong> This paper investigates patterns of Igbo–English code-switching among undergraduate students. Using recorded conversations and the Markedness Model as its theoretical framework, the study identifies the social motivations that govern switches between the two languages. Findings indicate that students use code-switching to negotiate solidarity, signal authority and mark shifts in topic. The study contributes to research on bilingual identity in West African higher education.</p>$html$,
   array['code-switching', 'Igbo', 'bilingualism', 'identity', 'sociolinguistics'], 19, 36, 'apa7', 20),
  ('00000000-0000-4000-8000-000000260103', 'drama-and-theatre-studies',
   'Ritual, Performance and Political Satire in Post-Independence Nigerian Drama',
   'sample-ritual-performance-and-political-satire',
   $html$<p><strong>Sample article.</strong> This article explores how post-independence Nigerian playwrights adapt ritual forms to stage political satire. Through close reading of selected plays and their performance histories, it argues that ritual structure gives satire a communal authority that protects it from censorship. The paper situates these plays within debates on the social function of African theatre.</p>$html$,
   array['ritual', 'satire', 'Nigerian drama', 'performance'], 37, 52, 'mla8', 30)
) as v (id, category_slug, title, slug, abstract, keywords, first_page, last_page, style, sort_order)
join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

insert into public.article_authors (article_id, full_name, affiliation, position, is_corresponding)
select v.article_id::uuid, v.full_name, v.affiliation, v.position, v.position = 0
from (values
  ('00000000-0000-4000-8000-000000260101', 'Ngozi A. Okeke', 'Department of English and Literary Studies, University of Nigeria, Nsukka', 0),
  ('00000000-0000-4000-8000-000000260102', 'Chukwuemeka J. Eze', 'Department of Linguistics, Igbo and Other Nigerian Languages, University of Nigeria, Nsukka', 0),
  ('00000000-0000-4000-8000-000000260102', 'Amaka P. Nwosu', 'Use of English Unit, University of Nigeria, Nsukka', 1),
  ('00000000-0000-4000-8000-000000260103', 'Tunde O. Adebayo', 'Department of Theatre and Film Studies, University of Nigeria, Nsukka', 0),
  ('00000000-0000-4000-8000-000000260103', 'Ifeoma C. Obi', 'Department of English and Literary Studies, University of Nigeria, Nsukka', 1),
  ('00000000-0000-4000-8000-000000260103', 'Kelechi U. Nnamdi', 'Department of English, Nnamdi Azikiwe University, Awka', 2)
) as v (article_id, full_name, affiliation, position)
where not exists (select 1 from public.article_authors a where a.article_id = v.article_id::uuid);

-- Fictional sample reading figures so "Most read" has an order to display.
update public.articles a set view_count = v.views
from (values
  ('00000000-0000-4000-8000-000000260101'::uuid, 412),
  ('00000000-0000-4000-8000-000000260102'::uuid, 268),
  ('00000000-0000-4000-8000-000000260103'::uuid, 157)
) as v (id, views)
where a.id = v.id and a.view_count = 0;
