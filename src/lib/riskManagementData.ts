// Risk Management Data for MDR vs AI Act comparison

export interface RiskExample {
  id: string;
  title: string;
  description: string;
  icon: string;
  severity: 'high' | 'medium' | 'low';
  mdrOnly: boolean; // true = exists in MDR, false = AI Act specific
  aiActSpecific: boolean;
  visualExample?: {
    scenario: string;
    impact: string;
    imageDescription: string;
  };
}

export interface StakeholderPerspective {
  id: string;
  role: 'manufacturer' | 'clinician' | 'patient';
  title: string;
  icon: string;
  mdrResponsibilities: string[];
  aiActAdditional: string[];
  benefits: string[];
}

export interface CoverageMapping {
  id: string;
  requirement: string;
  mdrCoverage: 'full' | 'partial' | 'none';
  aiActCoverage: 'full' | 'partial' | 'none';
  gap: string | null;
  additionalWork: string | null;
}

// Risk examples comparing MDR vs AI Act
export const riskExamples: RiskExample[] = [
  {
    id: 'misclassification',
    title: 'Image Misclassification',
    description: 'AI incorrectly classifies skin lesion, leading to missed diagnosis',
    icon: 'ImageOff',
    severity: 'high',
    mdrOnly: true,
    aiActSpecific: false,
    visualExample: {
      scenario: 'Melanoma classified as benign nevus',
      impact: 'Delayed treatment, potential disease progression',
      imageDescription: 'Skin lesion image with incorrect classification label'
    }
  },
  {
    id: 'demographic-bias',
    title: 'Demographic Bias',
    description: 'Model performs worse on darker skin tones due to training data imbalance',
    icon: 'Users',
    severity: 'high',
    mdrOnly: false,
    aiActSpecific: true,
    visualExample: {
      scenario: 'Lower accuracy on Fitzpatrick skin types V-VI',
      impact: 'Health disparities, discrimination in care',
      imageDescription: 'Accuracy chart showing performance gap across skin tones'
    }
  },
  {
    id: 'hallucination',
    title: 'AI Hallucination',
    description: 'Model generates confident but fabricated diagnostic reasoning',
    icon: 'BrainCircuit',
    severity: 'high',
    mdrOnly: false,
    aiActSpecific: true,
    visualExample: {
      scenario: 'AI invents non-existent clinical features',
      impact: 'Misleading clinicians, eroding trust',
      imageDescription: 'AI explanation citing features not present in image'
    }
  },
  {
    id: 'device-malfunction',
    title: 'Device Malfunction',
    description: 'Software failure or system crash during analysis',
    icon: 'AlertTriangle',
    severity: 'medium',
    mdrOnly: true,
    aiActSpecific: false,
    visualExample: {
      scenario: 'System timeout during critical diagnosis',
      impact: 'Workflow disruption, potential patient harm',
      imageDescription: 'Error screen during image analysis'
    }
  },
  {
    id: 'model-drift',
    title: 'Algorithmic Drift',
    description: 'Model performance degrades over time as data distributions change',
    icon: 'TrendingDown',
    severity: 'medium',
    mdrOnly: false,
    aiActSpecific: true,
    visualExample: {
      scenario: 'Accuracy drops from 95% to 82% over 18 months',
      impact: 'Undetected degradation in diagnostic quality',
      imageDescription: 'Performance trend chart showing decline'
    }
  },
  {
    id: 'human-rights',
    title: 'Fundamental Rights Impact',
    description: 'AI decisions affecting access to healthcare or insurance',
    icon: 'Scale',
    severity: 'high',
    mdrOnly: false,
    aiActSpecific: true,
    visualExample: {
      scenario: 'AI screening affects insurance coverage decisions',
      impact: 'Discrimination, reduced healthcare access',
      imageDescription: 'Flowchart showing AI impact on patient rights'
    }
  },
  {
    id: 'data-poisoning',
    title: 'Training Data Poisoning',
    description: 'Corrupted or malicious data in training set affects model behavior',
    icon: 'Database',
    severity: 'high',
    mdrOnly: false,
    aiActSpecific: true,
    visualExample: {
      scenario: 'Adversarial images in training data',
      impact: 'Systematic misclassification vulnerabilities',
      imageDescription: 'Diagram showing data pipeline vulnerability'
    }
  }
];

// Stakeholder perspectives
export const stakeholderPerspectives: StakeholderPerspective[] = [
  {
    id: 'manufacturer',
    role: 'manufacturer',
    title: 'Manufacturer / Developer',
    icon: 'Factory',
    mdrResponsibilities: [
      'ISO 14971 risk management process',
      'Clinical validation studies',
      'Post-market surveillance system',
      'Incident reporting (Article 87)',
      'Periodic safety update reports'
    ],
    aiActAdditional: [
      'Bias testing across demographic groups',
      'Model explainability documentation',
      'Algorithmic drift monitoring',
      'Fundamental rights impact assessment',
      'Human oversight mechanism design',
      'Training data documentation & provenance',
      'Robustness testing (adversarial scenarios)'
    ],
    benefits: [
      'Clearer compliance pathway',
      'Competitive differentiation through trustworthy AI',
      'Reduced liability through documented governance',
      'Proactive risk mitigation'
    ]
  },
  {
    id: 'clinician',
    role: 'clinician',
    title: 'Clinician / Healthcare Provider',
    icon: 'Stethoscope',
    mdrResponsibilities: [
      'Follow instructions for use',
      'Report adverse events',
      'Maintain device according to guidelines',
      'Clinical judgment in final decisions'
    ],
    aiActAdditional: [
      'Understand AI limitations and confidence levels',
      'Access to explanations for AI recommendations',
      'Ability to override AI decisions',
      'Awareness of demographic performance variations',
      'Training on AI-specific failure modes'
    ],
    benefits: [
      'Better understanding of AI decision factors',
      'More equitable patient care',
      'Clear override procedures',
      'Improved clinical confidence in AI tools'
    ]
  },
  {
    id: 'patient',
    role: 'patient',
    title: 'Patient',
    icon: 'Heart',
    mdrResponsibilities: [
      'Informed consent for medical device use',
      'Report any concerns to healthcare provider'
    ],
    aiActAdditional: [
      'Right to know AI is involved in care',
      'Right to explanation of AI decisions',
      'Protection from discriminatory AI',
      'Transparency about data usage',
      'Recourse mechanisms for AI-related concerns'
    ],
    benefits: [
      'Fairer treatment regardless of demographics',
      'Better informed about AI role in care',
      'Protected fundamental rights',
      'More trustworthy healthcare AI'
    ]
  }
];

// Coverage mapping: how MDR and AI Act requirements align
export const coverageMappings: CoverageMapping[] = [
  {
    id: 'risk-analysis',
    requirement: 'Risk Analysis & Identification',
    mdrCoverage: 'full',
    aiActCoverage: 'full',
    gap: null,
    additionalWork: null
  },
  {
    id: 'clinical-validation',
    requirement: 'Clinical Validation / Performance Testing',
    mdrCoverage: 'full',
    aiActCoverage: 'partial',
    gap: 'AI Act requires demographic subgroup analysis',
    additionalWork: 'Extend validation to include fairness metrics'
  },
  {
    id: 'post-market',
    requirement: 'Post-Market Surveillance',
    mdrCoverage: 'full',
    aiActCoverage: 'partial',
    gap: 'AI Act requires algorithmic drift monitoring',
    additionalWork: 'Add AI-specific monitoring dashboards'
  },
  {
    id: 'documentation',
    requirement: 'Technical Documentation',
    mdrCoverage: 'full',
    aiActCoverage: 'partial',
    gap: 'AI Act requires training data documentation',
    additionalWork: 'Document data provenance and labeling methodology'
  },
  {
    id: 'bias-testing',
    requirement: 'Bias & Fairness Testing',
    mdrCoverage: 'none',
    aiActCoverage: 'full',
    gap: 'Not addressed by MDR',
    additionalWork: 'Implement comprehensive bias testing framework'
  },
  {
    id: 'explainability',
    requirement: 'Model Explainability',
    mdrCoverage: 'none',
    aiActCoverage: 'full',
    gap: 'Not addressed by MDR',
    additionalWork: 'Develop explainability methods and documentation'
  },
  {
    id: 'human-oversight',
    requirement: 'Human Oversight Mechanisms',
    mdrCoverage: 'partial',
    aiActCoverage: 'full',
    gap: 'MDR has clinical judgment; AI Act requires specific override controls',
    additionalWork: 'Design explicit human-in-the-loop interfaces'
  },
  {
    id: 'fundamental-rights',
    requirement: 'Fundamental Rights Assessment',
    mdrCoverage: 'none',
    aiActCoverage: 'full',
    gap: 'Not addressed by MDR',
    additionalWork: 'Conduct impact assessment on fundamental rights'
  }
];

// Summary statistics for the toggle comparison
export const comparisonStats = {
  mdrOnly: {
    totalRequirements: 45,
    riskCategories: 12,
    documentTypes: 8,
    monitoringMetrics: 15
  },
  withAiAct: {
    totalRequirements: 72,
    riskCategories: 19,
    documentTypes: 14,
    monitoringMetrics: 28,
    additionalRequirements: 27,
    newRiskCategories: 7,
    newDocuments: 6,
    newMetrics: 13
  }
};
