export interface Metric {
  value: string;
  label: string;
}

export interface Project {
  id: string;
  title: string;
  categories: string[];
  shortDescription: string;
  problem: string;
  solution: string;
  techStack: string[];
  metrics: Metric[];
  year: string;
  featured: boolean;
  company: string;
  role: string;
}

export const projects: Project[] = [
  {
    id: "gto-erp-digital-transformation",
    title: "Enterprise ERP Program & Digital Transformation",
    categories: ["ERP"],
    shortDescription: "Leading the enterprise-wide ERP implementation program and digital transformation strategy, aligning technology initiatives with business objectives using Agile methodologies.",
    problem: "The organization required a comprehensive digital transformation strategy and enterprise-wide ERP implementation to modernize operations, improve efficiency, and create a scalable technology foundation for growth.",
    solution: "Directing the full ERP program lifecycle from strategy and vendor selection through implementation and change management. Applying Agile methodologies and analytical leadership to ensure the ERP platform aligns with business objectives, integrates across all departments, and delivers measurable operational improvements.",
    techStack: ["ERP Platform", "Agile Methodologies", "Project Management", "Business Analysis", "Change Management", "Digital Transformation"],
    metrics: [
      { value: "Enterprise", label: "ERP Program Scope" },
      { value: "Agile", label: "Methodology Applied" },
      { value: "Ongoing", label: "Active Program" }
    ],
    year: "2025",
    featured: true,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "odoo-erp-migration",
    title: "Odoo POS Systems & ERP Modules Migration",
    categories: ["ERP"],
    shortDescription: "End-to-end implementation and optimization of Odoo ERP, ensuring seamless business process integration across retail, warehouse, and service operations.",
    problem: "The organization relied on fragmented legacy systems across retail, warehouse, and service operations, resulting in inconsistent data, manual reconciliation, and limited visibility into business performance. The IT roadmap needed a unified, scalable platform to support digital transformation goals.",
    solution: "Oversaw the end-to-end implementation and optimization of Odoo ERP, translating business goals into a secure, efficient, and scalable IT roadmap. Drove seamless business process integration across all operational units, spearheaded automation and digital transformation projects including RPA and workflow optimization to enhance productivity and achieve measurable cost efficiency.",
    techStack: ["Odoo ERP", "Cloudpepper (PaaS & SaaS)", "QNAP", "Microsoft Technologies", "Google Technologies"],
    metrics: [
      { value: "100%", label: "Process Integration" },
      { value: "Scalable", label: "IT Practices Established" },
      { value: "Measurable", label: "Cost Efficiency Gains" }
    ],
    year: "2025",
    featured: true,
    company: "Chris Sports, Inc.",
    role: "Information Technology Manager"
  },
  {
    id: "it-infrastructure-recalibration",
    title: "IT Infrastructure Recalibration & DB/DR Framework",
    categories: ["Cloud"],
    shortDescription: "Directed all IT infrastructure including network architecture, cloud platforms, and cybersecurity frameworks ensuring resilience and compliance.",
    problem: "Aging infrastructure, inconsistent network architecture, and lack of a formal disaster recovery framework left the organization vulnerable to downtime, security breaches, and compliance risks.",
    solution: "Directed comprehensive IT infrastructure recalibration including network architecture redesign, Cloud platform adoption (SaaS/PaaS), and implementation of cybersecurity frameworks. Established a robust Database and Disaster Recovery framework ensuring system resilience, compliance, and long-term business continuity.",
    techStack: ["Cloudpepper", "QNAP", "Microsoft Technologies", "Network Architecture", "Cybersecurity Frameworks"],
    metrics: [
      { value: "High", label: "System Uptime" },
      { value: "Full", label: "DR Framework Coverage" },
      { value: "Compliant", label: "Security Standards" }
    ],
    year: "2025",
    featured: false,
    company: "Chris Sports, Inc.",
    role: "Information Technology Manager"
  },
  {
    id: "infrastructure-containerization",
    title: "Infrastructure Buildout & System Containerization",
    categories: ["Integration"],
    shortDescription: "Directed the creation of containerized infrastructure, VLAN firewall configurations, and software development governance for a fintech remittance platform.",
    problem: "A growing fintech remittance platform lacked structured infrastructure, containerization standards, and IT/security compliance governance. Software development processes were ungoverned, and there was no formal organizational structure for the technical department.",
    solution: "Led a team of 17 technical professionals, establishing the departmental organization chart and successfully proposing the creation of a CIO role. Directed the creation of containerized infrastructure (Docker), VLAN Firewall and Security Configurations, and validated all software development to align with IT and Security Compliances. Drafted and implemented standard policies and procedures later adopted organization-wide.",
    techStack: ["Docker", "Digital Ocean", "Cisco", "MS Visual Studio (C#)", "MSSQL", "MS Power BI", "AI", "VPN", "Ubuntu"],
    metrics: [
      { value: "17", label: "Team Members Led" },
      { value: "CIO Role", label: "Successfully Proposed" },
      { value: "Org-Wide", label: "Policy Adoption" }
    ],
    year: "2023",
    featured: true,
    company: "Ventaja International Corp.",
    role: "IT Consultant - Engineering Head"
  },
  {
    id: "cloud-migration-cicd",
    title: "Cloud Migration & CI/CD Pipeline Implementation",
    categories: ["Cloud", "Integration"],
    shortDescription: "Led the pioneering DevOps Manila team, overseeing database migration from on-premise to AWS cloud resources and implementing CI/CD pipelines.",
    problem: "On-premise database infrastructure was causing scalability limitations and operational overhead. The organization lacked DevOps practices, CI/CD pipelines, and structured production monitoring, resulting in slower delivery cycles and reduced system reliability.",
    solution: "Led the pioneering DevOps Manila team, overseeing database migration from on-premise to cloud resources (AWS RDS) and implementing CI/CD Pipelines (Jenkins, GitLab) for continuous integration and delivery. Established day-to-day monitoring processes using AWS CloudWatch, Nagios, and proprietary tools. Applied Agile and Scrum methodologies to manage the technical portfolio and increase process efficiency. Delivered this work in support of US-based clients Sodexo, LLC and Inspirus, LLC.",
    techStack: ["AWS CloudWatch", "AWS RDS", "AWS Budget", "Jenkins", "GitLab", "Nagios", "SQL", "Linux", "Python", "Jira", "Confluence"],
    metrics: [
      { value: "AWS", label: "Cloud Platform Migrated" },
      { value: "CI/CD", label: "Pipelines Implemented" },
      { value: "Agile", label: "Portfolio Management" }
    ],
    year: "2016",
    featured: true,
    company: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC)",
    role: "Development & IT Operations Engineer"
  },
  {
    id: "security-operations-center",
    title: "Security Operations & Monitoring Center Design",
    categories: ["Governance"],
    shortDescription: "Supervised end-to-end execution of large-scale security projects including SOC design and access control systems for BSP, JP Morgan, and Emerson.",
    problem: "High-profile financial and industrial clients required enterprise-grade physical and digital security infrastructure that met strict banking standards for data management, confidentiality, and regulatory compliance. Projects demanded complex stakeholder coordination across security divisions and executive leadership.",
    solution: "Supervised end-to-end execution of large-scale security projects, including the Design and Build of a Security Operations and Monitoring Center and Turnstile/Access Control System Installations for JP Morgan and BSP. Ensured all projects adhered to IT and Security Compliance standards, crafting policies and procedures aligned with banking standards. Managed communications with Security Facility Directors, Security Executive Divisions, and JP Morgan Security Stakeholders.",
    techStack: ["Geoffrey Access Control", "Mobotix VMS", "HID Turnstile/IMS", "Cisco Network IP", "S2 Security System"],
    metrics: [
      { value: "BSP", label: "Central Bank Project" },
      { value: "JP Morgan", label: "Global Bank Project" },
      { value: "100%", label: "Compliance Adherence" }
    ],
    year: "2012",
    featured: false,
    company: "Main Hardware, Inc.",
    role: "IT Technical - Project Manager"
  },
  {
    id: "enterprise-tools-development",
    title: "Enterprise Tools Development & Global Deployment",
    categories: ["ERP"],
    shortDescription: "Developed and deployed critical enterprise tools with global impact, focusing on software engineering, database management, and HR/BPO standards.",
    problem: "The global BPO organization lacked centralized, compliant tools for managing leave allocation and specialized time-off processes. Manual workflows created inconsistencies and inefficiencies across multiple international offices.",
    solution: "Developed and deployed critical enterprise tools including Leave Allocation and CTO/SPL Manager systems with global impact. Focused on software engineering best practices, database management, and adherence to HR/BPO standards, delivering solutions that streamlined workforce management across the organization's international operations.",
    techStack: ["MS Visual Studio (C#)", "MSSQL", "SQL", "Database Management", "Software Engineering"],
    metrics: [
      { value: "Global", label: "Deployment Scope" },
      { value: "HR/BPO", label: "Standards Compliance" },
      { value: "Enterprise", label: "Tools Delivered" }
    ],
    year: "2015",
    featured: false,
    company: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC)",
    role: "Senior Software Engineer"
  },
  {
    id: "payremit-pos-airport",
    title: "POS Installations at Airport Terminals",
    categories: ["Integration"],
    shortDescription: "Managed the deployment of POS installations at airport terminals, including in-house employee and payroll system development for the fintech platform.",
    problem: "The fintech remittance platform needed physical presence at airport terminals with reliable POS systems, while also lacking internal tools for employee management and payroll processing.",
    solution: "Successfully managed diverse projects including deploying POS installations at Airport Terminals and creating an in-house Employee and Payroll System. Established Standard Communication Tools for the Software Development Team, ensuring consistent collaboration and development governance across all technical workstreams.",
    techStack: ["POS Systems", "Docker", "MSSQL", "C#", "Digital Ocean", "Communication Tools"],
    metrics: [
      { value: "Airport", label: "Terminal Deployments" },
      { value: "In-House", label: "Payroll System Built" },
      { value: "Standardized", label: "Dev Communication" }
    ],
    year: "2023",
    featured: false,
    company: "Ventaja International Corp.",
    role: "IT Consultant - Engineering Head"
  },
  {
    id: "ticketing-system",
    title: "IT Ticketing System (iTech-Care Ticketing App)",
    categories: ["Software Dev"],
    shortDescription: "Designed and developed an in-house IT ticketing system to streamline service requests, incident tracking, and resolution workflows across the organization.",
    problem: "IT support requests were handled through informal channels — emails, chat messages, and verbal requests — resulting in lost tickets, unclear prioritization, and no visibility into resolution times or team workload.",
    solution: "Built a centralized IT ticketing system from the ground up, enabling structured submission, categorization, assignment, and tracking of all IT service requests and incidents. Implemented priority-based routing, SLA tracking, and reporting dashboards to give management visibility into team performance and service quality.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "HTML/CSS", "JavaScript"],
    metrics: [
      { value: "Centralized", label: "IT Support Workflow" },
      { value: "SLA", label: "Tracking Implemented" },
      { value: "Full", label: "Incident Lifecycle" }
    ],
    year: "2026",
    featured: false,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "in-house-erp-system",
    title: "In-House ERP System (Juan-ERP App)",
    categories: ["ERP"],
    shortDescription: "Developed a custom enterprise resource planning system tailored to the organization's specific business processes, integrating operations, finance, and reporting.",
    problem: "Off-the-shelf ERP solutions did not fully align with the organization's unique operational workflows. Customization costs for third-party platforms were prohibitive, and critical business logic was scattered across disconnected tools and spreadsheets.",
    solution: "Architected and developed a custom ERP system tailored to the organization's specific business processes, consolidating operations, finance, inventory, and reporting into a single integrated platform. Built with extensibility in mind, allowing modules to be added as business needs evolved.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "MS Power BI", "REST API"],
    metrics: [
      { value: "Custom", label: "Business Process Fit" },
      { value: "Integrated", label: "Operations & Finance" },
      { value: "Extensible", label: "Modular Architecture" }
    ],
    year: "2026",
    featured: true,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "payroll-system",
    title: "In-House Payroll System",
    categories: ["Software Dev"],
    shortDescription: "Built an in-house employee and payroll system to manage compensation, deductions, government contributions, and payslip generation for the entire organization.",
    problem: "The organization relied on manual payroll processing using spreadsheets, which was error-prone, time-consuming, and non-compliant with regulatory requirements for government contribution reporting.",
    solution: "Developed a comprehensive payroll system handling salary computation, tax deductions, government contributions (SSS, PhilHealth, Pag-IBIG), overtime, and payslip generation. Integrated with attendance data and leave records for accurate automated payroll processing.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "Crystal Reports"],
    metrics: [
      { value: "Automated", label: "Payroll Processing" },
      { value: "Compliant", label: "Government Contributions" },
      { value: "Accurate", label: "Computation Engine" }
    ],
    year: "2026",
    featured: false,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "centralized-application-hub",
    title: "Centralized Application Hub (Digital ToolBox App)",
    categories: ["Software Dev"],
    shortDescription: "Created a unified application hub serving as the single entry point for all in-house tools, systems, and resources across the organization.",
    problem: "Employees had to navigate multiple disconnected applications, portals, and URLs to access different internal tools. There was no unified dashboard, leading to poor adoption of internal systems and wasted time searching for the right tool.",
    solution: "Designed and developed a centralized application hub — a single-sign-on portal providing unified access to all in-house applications, tools, and resources. Implemented role-based access control so each employee saw only the tools relevant to their department and responsibilities.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "HTML/CSS", "JavaScript", "REST API"],
    metrics: [
      { value: "Single", label: "Entry Point for All Tools" },
      { value: "Role-Based", label: "Access Control" },
      { value: "Improved", label: "Tool Adoption Rate" }
    ],
    year: "2026",
    featured: false,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "stafftime-report",
    title: "Stafftime Report for Agents",
    categories: ["Software Dev"],
    shortDescription: "Developed a stafftime reporting tool for BPO agents, providing real-time visibility into agent productivity, schedule adherence, and workforce utilization.",
    problem: "Workforce management lacked granular visibility into agent-level time utilization. Supervisors could not easily track schedule adherence, productive hours, or identify patterns impacting service levels and operational efficiency.",
    solution: "Built a stafftime reporting application that aggregated agent activity data, providing supervisors and managers with real-time and historical views of schedule adherence, productive time, idle time, and break compliance. Enabled data-driven workforce decisions and performance coaching.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", "SQL Reporting", "Windows Services"],
    metrics: [
      { value: "Real-Time", label: "Agent Visibility" },
      { value: "Data-Driven", label: "Workforce Decisions" },
      { value: "Improved", label: "Schedule Adherence" }
    ],
    year: "2015",
    featured: false,
    company: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC)",
    role: "Senior Software Engineer"
  },
  {
    id: "online-project-request",
    title: "Online Project Request Form",
    categories: ["Software Dev", "Governance"],
    shortDescription: "Developed an online project request system to standardize how departments submit, track, and manage technology project requests through a structured approval workflow.",
    problem: "Project requests came through unstructured channels — emails, meetings, and verbal requests — making it impossible to prioritize, track, or measure demand for IT and development resources across the organization.",
    solution: "Created an online project request form with structured submission fields, automatic routing to the appropriate approvers, and status tracking for requestors. Implemented a prioritization framework that gave leadership clear visibility into the project pipeline and resource allocation.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "HTML/CSS", "JavaScript"],
    metrics: [
      { value: "Structured", label: "Request Pipeline" },
      { value: "Automated", label: "Approval Routing" },
      { value: "Full", label: "Pipeline Visibility" }
    ],
    year: "2026",
    featured: false,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "survey-tool",
    title: "Survey Tool for Process Improvement",
    categories: ["Software Dev"],
    shortDescription: "Built an enterprise survey tool deployed across all departments to gather structured feedback for continuous process improvement and organizational development.",
    problem: "The organization lacked a formal mechanism for collecting employee feedback and process improvement suggestions. Manual survey methods had low participation rates and provided no actionable analytics.",
    solution: "Developed an in-house survey tool enabling structured data collection across all departments. Built with customizable survey templates, anonymous submission options, and automated analytics dashboards. Used to drive continuous process improvement initiatives and measure the effectiveness of organizational changes.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "HTML/CSS", "JavaScript", "Charts.js"],
    metrics: [
      { value: "All Depts", label: "Organization-Wide Use" },
      { value: "Automated", label: "Analytics & Reporting" },
      { value: "Continuous", label: "Process Improvement" }
    ],
    year: "2025",
    featured: false,
    company: "Chris Sports, Inc.",
    role: "Information Technology Manager"
  },
  {
    id: "attendance-facial-recognition",
    title: "Attendance System with Facial Recognition",
    categories: ["Software Dev"],
    shortDescription: "Engineered an attendance management system using facial recognition technology, eliminating manual time logging and buddy-punching across the organization.",
    problem: "Traditional attendance tracking methods (manual logbooks, card-based systems) were susceptible to buddy-punching, time theft, and inaccurate records. HR spent excessive time reconciling attendance data for payroll processing.",
    solution: "Engineered an attendance system integrated with facial recognition technology for accurate, contactless time-in/time-out logging. The system eliminated buddy-punching, automated attendance record keeping, and seamlessly fed data into the payroll system for accurate compensation calculations.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", "AI/ML", "Facial Recognition SDK", "Camera Integration"],
    metrics: [
      { value: "AI-Powered", label: "Facial Recognition" },
      { value: "Zero", label: "Buddy-Punching" },
      { value: "Automated", label: "Payroll Integration" }
    ],
    year: "2026",
    featured: true,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "leave-management-tool",
    title: "Leave Management Tool",
    categories: ["Software Dev"],
    shortDescription: "Developed a leave management application enabling employees to submit, track, and manage leave requests with automated approval workflows and balance tracking.",
    problem: "Leave management was handled through paper forms and email chains, creating delays in approvals, inaccurate balance tracking, and difficulty generating compliance reports for HR and management.",
    solution: "Built a leave management tool with self-service leave request submission, automated multi-level approval workflows, real-time leave balance tracking, and comprehensive reporting. Integrated with the attendance and payroll systems to ensure accurate leave deduction and compensation processing.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "REST API"],
    metrics: [
      { value: "Self-Service", label: "Employee Portal" },
      { value: "Multi-Level", label: "Approval Workflow" },
      { value: "Real-Time", label: "Balance Tracking" }
    ],
    year: "2015",
    featured: false,
    company: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC)",
    role: "Senior Software Engineer"
  },
  {
    id: "it-asset-system",
    title: "IT Asset Management System",
    categories: ["Software Dev"],
    shortDescription: "Built an IT asset tracking system for managing hardware and software inventory, assignments, lifecycle status, and depreciation across the organization.",
    problem: "IT assets (laptops, monitors, peripherals, software licenses) were tracked in spreadsheets with no centralized visibility. Lost or unaccounted assets, expired licenses, and unplanned hardware failures created financial waste and operational risk.",
    solution: "Developed an IT asset management system providing complete lifecycle tracking from procurement to disposal. Implemented asset assignment tracking, warranty and maintenance schedules, software license management, and automated depreciation calculations. Gave management clear visibility into asset utilization and budget planning.",
    techStack: ["C#", "MSSQL", "MS Visual Studio", ".NET Framework", "Barcode Integration", "Crystal Reports"],
    metrics: [
      { value: "Full", label: "Lifecycle Tracking" },
      { value: "Automated", label: "Depreciation & Alerts" },
      { value: "Centralized", label: "Asset Visibility" }
    ],
    year: "2026",
    featured: false,
    company: "GTO Trading Corporation",
    role: "Head IT Digital Transformation & Program Director"
  },
  {
    id: "portfolio-website",
    title: "Executive Portfolio Website",
    categories: ["Software Dev", "Integration", "Cloud"],
    shortDescription: "Designed and developed a production-ready personal portfolio website showcasing professional experience, project portfolio, and capabilities.",
    problem: "Professional accomplishments, project history, and technical capabilities were scattered across resumes, LinkedIn, and documents with no unified, interactive platform to present them to potential employers and stakeholders.",
    solution: "Architected and built a modern, responsive portfolio website using React, Vite, and Tailwind CSS. Implemented dynamic project pages, filterable portfolio grid, animated interactions, and a contact system. Designed with a dark-mode-first executive aesthetic and optimized for performance and SEO.",
    techStack: ["React", "TypeScript", "Vite", "Tailwind CSS", "Framer Motion", "Wouter"],
    metrics: [
      { value: "6", label: "Pages Built" },
      { value: "20+", label: "Projects Showcased" },
      { value: "Responsive", label: "All Devices" }
    ],
    year: "2026",
    featured: false,
    company: "Personal Project Initiative",
    role: "Full-Stack Developer"
  },
  {
    id: "gaming-apps",
    title: "Gaming Applications",
    categories: ["Software Dev"],
    shortDescription: "Developed interactive gaming applications exploring game mechanics, UI/UX design, and real-time rendering — applying software engineering skills to creative development.",
    problem: "Wanted to expand technical expertise beyond enterprise software into interactive media, applying software engineering discipline to game development while exploring real-time rendering, physics, and user experience design.",
    solution: "Designed and developed gaming applications covering various genres and game mechanics. Applied software engineering best practices including modular architecture, performance optimization, and iterative design. Used the projects to sharpen skills in real-time systems, UI/UX interaction design, and creative problem solving.",
    techStack: ["Game Development Frameworks", "JavaScript", "TypeScript", "Canvas/WebGL", "UI/UX Design"],
    metrics: [
      { value: "Multiple", label: "Games Developed" },
      { value: "Real-Time", label: "Interactive Systems" },
      { value: "Creative", label: "Problem Solving" }
    ],
    year: "2026",
    featured: false,
    company: "Personal Project Initiative",
    role: "Full-Stack Developer"
  },
  {
    id: "home-automation-security",
    title: "Home Automation & Corporate Security Integrations",
    categories: ["Governance"],
    shortDescription: "Led collaboration with property developers for home automation and corporate security projects, focusing on Data Privacy Act compliance and technical governance.",
    problem: "Large real-estate development projects required sophisticated home automation and corporate security integration solutions that complied with the Data Privacy Act and met stringent technical governance requirements.",
    solution: "Led collaboration with property executive developers, managing significant project budgets and focusing on Data Privacy Act compliance and technical governance for large real-estate projects. Coordinated with third-party vendors to deliver integrated home automation and corporate security solutions meeting all regulatory and performance requirements.",
    techStack: ["Home Automation Systems", "Security Integration Platforms", "Network Infrastructure", "Data Privacy Frameworks"],
    metrics: [
      { value: "DPA", label: "Compliance Achieved" },
      { value: "Large-Scale", label: "Real Estate Projects" },
      { value: "Multi-Vendor", label: "Integration Managed" }
    ],
    year: "2013",
    featured: false,
    company: "Systems Variable Technicom, Inc.",
    role: "Head - Testing and Commissioning"
  }
];

export const getProjectById = (id: string) => projects.find((p) => p.id === id);
export const getFeaturedProjects = () => projects.filter((p) => p.featured);
export const getProjectsByCategory = (category: string) => projects.filter((p) => p.categories.includes(category));
export const categories = ["All", "Software Dev", "ERP", "Cloud", "Integration", "Governance"];

export interface TimelineEntry {
  period: string;
  role: string;
  context: string;
  description: string;
}

export const timeline: TimelineEntry[] = [
  {
    period: "Nov 2025 - Present",
    role: "Head IT Digital Transformation & Program Director for ERP",
    context: "GTO Trading Corporation (Full-time, On-site)",
    description: "Leading the organization's digital transformation strategy and directing the enterprise-wide ERP implementation program. Applying Agile methodologies and analytical leadership to align technology initiatives with business objectives.",
  },
  {
    period: "Jul 2025 - Oct 2025",
    role: "Information Technology Manager",
    context: "Chris Sports, Inc. (Retail, On-site)",
    description: "Drove the organization's technology vision, ensuring delivery of secure, efficient, and scalable IT operations. Led the IT team, oversaw Odoo ERP implementation and optimization, managed end-to-end IT infrastructure including cloud platforms and cybersecurity frameworks. Spearheaded automation and digital transformation projects. Reported to the Company Owner (Australia), CFO (PH), and VP Operations (PH).",
  },
  {
    period: "Apr 2025 - Jul 2025",
    role: "IT Consultant - Solutions Architect",
    context: "Lee Designs Inds. - Office Furniture (On-site)",
    description: "Provided solutions architecture consulting, designing technology strategies and system configurations to optimize business operations for the office furniture industry.",
  },
  {
    period: "Jan 2022 - Jul 2025",
    role: "IT Consultant - Solutions Provider",
    context: "JML (Freelance)",
    description: "Delivered independent IT consulting and solutions across multiple clients, covering project implementation, business decision-making, and technology strategy.",
  },
  {
    period: "Oct 2021 - Jul 2025",
    role: "Co-Founder & Entrepreneur",
    context: "Mikaela's AguaBest Water Distribution Services",
    description: "Co-founded and operated a water distribution business in Caloocan City. Applied business decision-making, project implementation, and operational management skills to build and scale the enterprise.",
  },
  {
    period: "Jul 2023 - Dec 2023",
    role: "IT Consultant - Engineering Head",
    context: "Ventaja International Corp. (Fintech, On-site)",
    description: "Returned as IT Consultant and Engineering Head, providing strategic technical leadership for vendor management, infrastructure decisions, and engineering governance for the fintech remittance platform.",
  },
  {
    period: "Aug 2018 - Dec 2021",
    role: "Senior Development & IT Operations Engineer",
    context: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC) (BPO/Global Services)",
    description: "Led the pioneering DevOps Manila team. Oversaw database migration from on-premise to AWS cloud resources (AWS RDS), implemented CI/CD Pipelines (Jenkins, GitLab), and established production monitoring processes. Provided executive reports to the Managing Director (US), Infrastructure Director (US), and the executive committee. Applied Agile and Scrum methodologies.",
  },
  {
    period: "Jan 2016 - Aug 2018",
    role: "Development & IT Operations Engineer",
    context: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC) (BPO/Global Services)",
    description: "Expanded into DevOps responsibilities including system monitoring, production support, and infrastructure management. Built expertise in problem solving, automation, and operational excellence.",
  },
  {
    period: "Feb 2014 - Jan 2016",
    role: "Senior Software Engineer",
    context: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC) (BPO/Global Services)",
    description: "Developed and deployed critical enterprise tools (Leave Allocation, CTO/SPL Manager) with global impact. Focused on software engineering using ASP.NET Web API, Team Foundation Server, and database management.",
  },
  {
    period: "May 2013 - Feb 2014",
    role: "Management Information System Analyst",
    context: "VXI Global Holdings B.V. (formerly VXI Global Solutions, LLC) (Makati City)",
    description: "Started at VXI focusing on project management, automation, and MIS analysis. Provided data-driven insights and system solutions to support business operations across the BPO organization.",
  },
  {
    period: "Dec 2012 - May 2013",
    role: "Head Technology, Testing & Commissioning",
    context: "Systems Variable Technicom, Inc. (On-site)",
    description: "Led collaboration with property executive developers for home automation and corporate security integrations. Managed significant project budgets, focusing on Data Privacy Act compliance and technical governance for large real-estate projects.",
  },
  {
    period: "Oct 2010 - Dec 2012",
    role: "IT Technical - Project Manager",
    context: "Main Hardware, Inc. (Manila City, On-site)",
    description: "Supervised end-to-end execution of large-scale security projects for BSP, JP Morgan, and Emerson. Designed Security Operations Centers, managed Turnstile/Access Control installations, and ensured IT/Security compliance with banking standards. Managed vendor relationships, budgets, and stakeholder communications.",
  },
  {
    period: "Jan 2010 - Oct 2010",
    role: "Partnerships Manager",
    context: "Gawad Kalinga Community Development Foundation (Mandaluyong City, On-site)",
    description: "Managed organizational partnerships and community relationships. Applied organization skills and CRM expertise to build and maintain strategic partnerships for the development foundation.",
  },
];

export function capabilitySlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface CapabilityArea {
  title: string;
  headline: string;
  description: string;
  skills: string[];
  platforms: string[];
  relatedProjectIds: string[];
}

export const capabilityAreas: CapabilityArea[] = [
  {
    title: "ERP & Digital Transformation",
    headline: "Enterprise Resource Planning & Process Optimization",
    description:
      "From end-to-end Odoo ERP implementation across retail, warehouse, and service operations to spearheading automation and RPA initiatives. I translate business goals into secure, efficient, and scalable IT roadmaps that drive measurable digital transformation.",
    skills: [
      "Odoo ERP Implementation & Optimization",
      "Business Process Integration & Automation",
      "RPA & Workflow Optimization",
      "IT Roadmap & Strategic Planning",
      "Change Management & Digital Adoption",
      "Executive-Level Reporting (C-Suite, Board)",
    ],
    platforms: ["Odoo ERP", "Cloudpepper (PaaS/SaaS)", "Microsoft Technologies", "Google Technologies", "QNAP"],
    relatedProjectIds: [
      "gto-erp-digital-transformation",
      "odoo-erp-migration",
      "enterprise-tools-development",
      "in-house-erp-system",
    ],
  },
  {
    title: "DevOps & Release Engineering",
    headline: "CI/CD Pipelines, Containerization & Production Operations",
    description:
      "I have built DevOps teams from scratch, directed Docker containerization strategies, and implemented CI/CD pipelines with Jenkins and GitLab. My approach pairs technical depth with organizational capability building — establishing the monitoring, release governance, and Agile/Scrum cadences that let engineering teams ship reliably at pace.",
    skills: [
      "CI/CD Pipeline Implementation (Jenkins, GitLab)",
      "Docker Containerization & Orchestration",
      "Release Governance & Deployment Standards",
      "Production Monitoring (CloudWatch, Nagios)",
      "Incident Response & On-Call Operations",
      "Agile & Scrum Portfolio Management",
    ],
    platforms: ["Docker", "Jenkins", "GitLab", "AWS CloudWatch", "Nagios", "Jira", "Confluence"],
    relatedProjectIds: [
      "cloud-migration-cicd",
      "infrastructure-containerization",
    ],
  },
  {
    title: "Software Engineering",
    headline: "Hands-On Coding, Design Patterns & Software Craftsmanship",
    description:
      "I write production code, not just slide decks. From C# enterprise tools used across global BPO operations to modern TypeScript and Python services, I apply solid design patterns, version-controlled workflows, peer review, and disciplined testing. My engineering background grounds every architectural and program-management decision in what's actually buildable and maintainable.",
    skills: [
      "Enterprise Application Development (C#, .NET)",
      "Modern Web Stacks (TypeScript, JavaScript, Python)",
      "API Design & REST/SSE Integration",
      "Design Patterns & Clean Architecture",
      "Version Control, Code Review & Branching Strategies",
      "Automated Testing & Quality Engineering",
      "Software Development Governance & Standards",
    ],
    platforms: ["C#", ".NET Framework", "TypeScript", "JavaScript", "Python", "MS Visual Studio", "Git", "GitLab", "Node.js"],
    relatedProjectIds: [
      "enterprise-tools-development",
      "in-house-erp-system",
      "ticketing-system",
      "payroll-system",
      "centralized-application-hub",
    ],
  },
  {
    title: "Cloud & Infrastructure",
    headline: "Cloud Migration, Network Architecture, Server & Workstation Management",
    description:
      "Led database migrations from on-premise to AWS cloud resources, designed VLAN and firewall configurations, and established comprehensive disaster recovery frameworks. Beyond cloud, I handle the full on-premise infrastructure stack — Active Directory setup, domain server configuration, desktop workstation provisioning, network configurations, and database architecture and management.",
    skills: [
      "Cloud Migration Strategy (AWS, Digital Ocean)",
      "Active Directory Setup & Domain Server Configuration",
      "Network Architecture & VLAN/Firewall Configuration",
      "Desktop Workstation Setup & Provisioning",
      "Database Architecture & Management (MSSQL, SQL, RDS)",
      "Application Integration & Deployment",
      "Database & Disaster Recovery Frameworks",
      "Production Monitoring & System Uptime Management",
      "FinOps & Cloud Budget Management",
      "Infrastructure Buildout & Scalability Planning",
    ],
    platforms: ["AWS CloudWatch", "AWS RDS", "AWS Budget", "Digital Ocean", "Active Directory", "Windows Server", "Cisco", "Ubuntu", "Linux", "MSSQL"],
    relatedProjectIds: [
      "it-infrastructure-recalibration",
      "cloud-migration-cicd",
      "infrastructure-containerization",
    ],
  },
  {
    title: "Data Management",
    headline: "Database Design, Integration & Reporting Across the Enterprise",
    description:
      "I treat data as a product. From designing MSSQL schemas behind in-house enterprise tools to migrating production databases from on-premise to AWS RDS, I have owned the full data lifecycle — modeling, integration, quality, backup and disaster recovery, and the executive reporting that turns it all into decisions. The result is data that leadership can trust and engineering teams can build on.",
    skills: [
      "Database Design & Modeling (MSSQL, SQL, RDS)",
      "ETL & Cross-System Data Integration",
      "Data Quality, Validation & Governance",
      "Backup, Recovery & Database DR Frameworks",
      "Reporting & Analytics (Power BI, Crystal Reports)",
      "Database Migration (On-Prem to Cloud)",
      "Data Privacy Act & NPC Compliance",
    ],
    platforms: ["MSSQL", "AWS RDS", "MS Power BI", "Crystal Reports", "SQL Reporting Services", "Odoo Data Models"],
    relatedProjectIds: [
      "it-infrastructure-recalibration",
      "in-house-erp-system",
      "stafftime-report",
    ],
  },
  {
    title: "Website & Application Development",
    headline: "Full-Stack Web & Application Delivery, End-to-End",
    description:
      "I build and ship full-stack applications, not just specifications. From in-house enterprise web tools — IT ticketing, ERP modules, payroll, asset management — to a production React + Vite portfolio backed by an Express API, I deliver responsive front-ends, well-designed back-end APIs, and the deployment story that gets them into users' hands. UX, accessibility, and performance are part of the brief, not afterthoughts.",
    skills: [
      "Modern Front-End (React, Vite, TypeScript, Tailwind)",
      "Back-End APIs (Express, Node.js, REST, SSE)",
      "Full-Stack Application Architecture",
      "Responsive & Mobile-Friendly UI",
      "Authentication, Sessions & Form Validation",
      "Deployment to Managed Cloud (Replit, Cloudpepper, Digital Ocean)",
      "Internal Tools & Line-of-Business Web Apps",
    ],
    platforms: ["React", "Vite", "TypeScript", "Express", "Node.js", "Tailwind CSS", "REST API", "PostgreSQL", "Replit"],
    relatedProjectIds: [
      "portfolio-website",
      "ticketing-system",
      "in-house-erp-system",
      "payroll-system",
      "leave-management-tool",
      "it-asset-system",
      "online-project-request",
      "survey-tool",
      "centralized-application-hub",
    ],
  },
  {
    title: "Systems Integration & Architecture",
    headline: "Solution Architecture & Enterprise System Integration",
    description:
      "From POS installations at airport terminals to Security Operations Center design for banking institutions, I architect and deliver complex system integrations that connect physical and digital infrastructure. My solutions span access control, video management, and enterprise networking.",
    skills: [
      "Solution & System Architecture (DB & DR frameworks)",
      "Security Systems Integration (SOC, Access Control)",
      "POS System Deployment & Integration",
      "Enterprise Networking (Cisco, IP Networks)",
      "Vendor Selection, Negotiation & Management",
      "Technical Project/Program Management",
    ],
    platforms: ["Geoffrey Access Control", "Mobotix VMS", "HID Turnstile/IMS", "Cisco Network IP", "S2 Security System"],
    relatedProjectIds: [
      "payremit-pos-airport",
      "security-operations-center",
      "home-automation-security",
      "attendance-facial-recognition",
    ],
  },
  {
    title: "IT Governance, Security & Compliance",
    headline: "Policy Development, Data Privacy & Compliance Standards",
    description:
      "I draft and implement IT and Security compliance policies that get adopted organization-wide. From banking-grade security standards for BSP and JP Morgan to Data Privacy Act compliance for real-estate projects, I build governance frameworks that protect without impeding progress.",
    skills: [
      "IT & Security Compliance Policy Development",
      "Data Privacy Act & NPC Compliance",
      "Banking Security Standards (BSP, JP Morgan)",
      "Budget Management & Business Proposals",
      "Stakeholder Management (C-Suite, Security Directors)",
      "AI Integrations and Governance",
    ],
    platforms: ["MS Power BI", "ServiceNow", "AI Platforms", "VPN", "Compliance Frameworks"],
    relatedProjectIds: [
      "security-operations-center",
      "home-automation-security",
      "it-infrastructure-recalibration",
    ],
  },
  {
    title: "Transformational Leadership",
    headline: "Developing Self-Initiating Teams That Deliver Without Supervision",
    description:
      "I lead by transforming how teams operate, not by watching over them. From day one I set clear task discipline and delivery expectations, then coach each team member to become a self-initiator who owns outcomes and holds themselves accountable. The result is a team that performs with the same focus and self-encouragement whether the director is in the room or not — a culture of ownership that scales beyond any single project or manager.",
    skills: [
      "Team Development & Coaching",
      "Task Discipline & Accountability Frameworks",
      "Mindset Transformation & Ownership Culture",
      "Self-Initiator Training & Delegation",
      "Leadership Without Micromanagement",
      "Performance Ownership & 1:1 Cadences",
      "Cross-Functional Team Building",
      "Mentoring & Career Development",
    ],
    platforms: ["1:1 Coaching Cadences", "OKRs & KPIs", "Agile Rituals", "Performance Reviews", "Jira", "Confluence"],
    relatedProjectIds: [
      "gto-erp-digital-transformation",
      "cloud-migration-cicd",
      "enterprise-tools-development",
    ],
  },
];

export const coreCompetencies: string[] = [
  "Strategic Planning",
  "Executive & C-Suite Reporting",
  "Enterprise Resource Planning (ERP)",
  "DevOps & CI/CD",
  "Software Engineering",
  "Web & Application Development",
  "Data Management",
  "Cloud Infrastructure",
  "Active Directory & Domain Server Configuration",
  "Network & Workstation Management",
  "Database Architecture & Management",
  "Application Integration",
  "IT & Security Governance",
  "Solution & System Architecture",
  "Technical Project/Program Management",
  "Vendor & Budget Management",
  "Digital Transformation",
  "Data Privacy Act & NPC",
  "AI Integrations and Governance",
  "Transformational Leadership",
  "Team Development & Coaching",
];

export const profileMeta = {
  name: "John Michael L. Libao",
  title: "Head IT Digital Transformation & Program Director",
  location: "Quezon City, Philippines",
  email: "cs_info@agentmail.to",
  linkedin: "linkedin.com/in/jlibao14",
  experienceYears: "10+",
  openTo: "ERP implementation, DevOps transformation, cloud migration, digital transformation programs, fractional/advisory engagements, executive technology leadership.",
  responseTime: "Within 48 business hours via the contact form on the site.",
};
