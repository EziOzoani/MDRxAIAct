export interface RegulatoryComponent {
  id: string;
  name: string;
  description: string;
  icon: string;
  mdrRequirements: {
    legislation: string[];
    requirements: string[];
    regulatoryText: string;
  };
  aiActRequirements: {
    legislation: string[];
    requirements: string[];
    regulatoryText: string;
  };
  overlapRequirements: {
    legislation: string[];
    requirements: string[];
    regulatoryText: string;
  };
}

export const regulatoryComponents: RegulatoryComponent[] = [
  {
    id: 'image-input',
    name: 'Image Input & Data Acquisition',
    description: 'Quality control and standardization of medical imaging data',
    icon: 'Camera',
    mdrRequirements: {
      legislation: [
        'MDR Annex II: Compliance requirements',
        'ISO 13485: Quality Management System',
        'IEC 62304: Software development lifecycle'
      ],
      requirements: [
        'Quality control of imaging equipment calibration',
        'Standardization of acquisition conditions (lighting, distance, angle)',
        'Data integrity and chain of custody documentation',
        'Storage security and access controls'
      ],
      regulatoryText: 'Medical device manufacturers must ensure consistent, high-quality input data. Image acquisition must follow standardized protocols with documented quality parameters. All data must be retained according to post-market surveillance requirements.'
    },
    aiActRequirements: {
      legislation: [
        'EU AI Act Article 10: Training, validation and testing data',
        'GDPR compliance for data collection and storage',
        'Article 13: Transparency requirements'
      ],
      requirements: [
        'Training data documentation and provenance',
        'Bias assessment and mitigation strategies',
        'Data labelling transparency and methodology',
        'User consent and data handling transparency'
      ],
      regulatoryText: 'High-risk AI systems must document all training data sources, demonstrate bias testing across demographic groups, and maintain transparent data handling procedures. Users must be informed about data collection and usage.'
    },
    overlapRequirements: {
      legislation: [
        'MDR Article 61: Post-market surveillance',
        'AI Act Article 26: Conformity assessment',
        'GDPR Article 35: Data Protection Impact Assessment (DPIA)'
      ],
      requirements: [
        'Dual documentation: Both clinical standards AND AI transparency',
        'Data traceability for both clinical validation AND AI audit trails',
        'Quality assurance for both device performance AND AI fairness',
        'Documented chain of custody for regulatory investigations'
      ],
      regulatoryText: 'Manufacturers must establish integrated data governance ensuring clinical-grade quality while maintaining AI transparency. This includes maintaining dual audit trails—one for device performance validation and one for AI system behaviour monitoring.'
    }
  },
  {
    id: 'preprocessing',
    name: 'Image Preprocessing & Normalisation',
    description: 'Validated algorithms for consistent image processing',
    icon: 'Sliders',
    mdrRequirements: {
      legislation: [
        'IEC 62304 Section 5.1: Software requirements specification',
        'ISO 13485 Section 4.4: Design and development'
      ],
      requirements: [
        'Validated image processing algorithms',
        'Specification of preprocessing parameters (contrast, brightness, filters)',
        'Stability testing across different input variations',
        'Documentation of processing validation studies'
      ],
      regulatoryText: 'All image preprocessing algorithms must be validated to ensure consistency and accuracy. Processing parameters must be documented and tested across representative image sets. Variations in preprocessing must not introduce clinically significant artefacts.'
    },
    aiActRequirements: {
      legislation: [
        'EU AI Act Article 13: Transparency requirements',
        'Article 8: Risk mitigation measures'
      ],
      requirements: [
        'Model explainability for preprocessing steps',
        'Documentation of preprocessing effects on model behaviour',
        'Testing for preprocessing-induced bias',
        'User understanding of data modifications'
      ],
      regulatoryText: 'High-risk systems must make clear how input data is modified during preprocessing. Documentation must show that preprocessing does not introduce systematic bias or unfairly disadvantage any demographic group.'
    },
    overlapRequirements: {
      legislation: [
        'MDR Article 2(4): Definition of clinical data',
        'AI Act Article 15: Quality management systems'
      ],
      requirements: [
        'Clinical validation of preprocessing consistency',
        'Explainability documentation for clinical professionals',
        'Bias testing across preprocessing variations',
        'Joint assessment of preprocessing impact on diagnostic accuracy'
      ],
      regulatoryText: 'Preprocessing must maintain clinical accuracy while providing transparent documentation of data transformations. Validation studies must assess both consistency and fairness, with results available to healthcare providers and regulators.'
    }
  },
  {
    id: 'ai-model',
    name: 'AI Model & Classification Engine',
    description: 'Core AI system for medical image analysis and classification',
    icon: 'Brain',
    mdrRequirements: {
      legislation: [
        'IEC 62304 Section 5.3: Software architectural design',
        'ISO 13485 Section 8.2.3: Design and development validation',
        'GHTF Guidelines on Software Validation'
      ],
      requirements: [
        'Analytical validation (sensitivity, specificity, accuracy)',
        'Clinical validation studies with representative population',
        'Stability and reproducibility testing',
        'Risk-based approach to algorithm changes',
        'Performance monitoring post-market'
      ],
      regulatoryText: 'The classification engine must undergo rigorous analytical validation demonstrating diagnostic performance against gold-standard methods. Clinical studies with representative populations must demonstrate safety and effectiveness. Performance metrics must be continuously monitored post-market.'
    },
    aiActRequirements: {
      legislation: [
        'EU AI Act Article 11: Technical documentation',
        'Article 14: Human oversight',
        'Article 10: Training, validation and testing data'
      ],
      requirements: [
        'Model documentation and training data records',
        'Testing for discrimination and fairness',
        'Human oversight mechanisms',
        'Robustness and accuracy assessment',
        'Documentation of model limitations and failure modes'
      ],
      regulatoryText: 'The AI model must be fully documented including training methodology, data sources, and performance metrics. Manufacturers must demonstrate testing for bias across gender, age, ethnicity, and skin tone. Clear limitations and confidence intervals must be communicated.'
    },
    overlapRequirements: {
      legislation: [
        'MDR Article 10: Risk management',
        'AI Act Article 9: Risk management system',
        'ETSI Standards for AI in healthcare'
      ],
      requirements: [
        'Dual validation: Clinical AND fairness testing',
        'Performance documentation: Sensitivity/specificity AND demographic parity',
        'Continuous monitoring: Safety signals AND algorithmic drift',
        'Risk stratification for both medical and AI-specific failure modes',
        'Transparency to both clinicians AND compliance teams'
      ],
      regulatoryText: 'The classification engine requires integrated validation demonstrating both clinical effectiveness and algorithmic fairness. Risk management must address both medical device failures and AI-specific risks. Documentation must be accessible to healthcare providers, regulators, and relevant stakeholders.'
    }
  },
  {
    id: 'clinical-output',
    name: 'Clinical Decision Support & Output',
    description: 'Clear communication of AI-assisted diagnostic results',
    icon: 'FileCheck',
    mdrRequirements: {
      legislation: [
        'IEC 62304 Section 5.4: Software detailed design',
        'ISO 13485 Section 7.5: Labelling and packaging',
        'EN 62079: Preparation of instructions for use'
      ],
      requirements: [
        'Clear communication of diagnostic suggestions',
        'Confidence intervals and uncertainty quantification',
        'Intended use and contraindications documentation',
        'User training requirements',
        'Output labelling and warnings'
      ],
      regulatoryText: 'Output must clearly indicate confidence levels and uncertainty. All clinical limitations must be communicated. User training requirements must be defined. Warnings about misuse must be prominently displayed in instructions for use.'
    },
    aiActRequirements: {
      legislation: [
        'EU AI Act Article 14: Human oversight',
        'Article 3(39): Explanation requirements',
        'Article 13: Transparency'
      ],
      requirements: [
        'Human-in-the-loop documentation',
        'Right to explanation',
        'Transparency about AI involvement',
        'Override capability documentation',
        'Informed consent for AI-based decisions'
      ],
      regulatoryText: 'Users must understand that outputs are AI-generated. They must have ability to override recommendations. System must explain key factors influencing classifications. Users must consent to AI involvement in diagnostic process.'
    },
    overlapRequirements: {
      legislation: [
        'MDR Article 23: Instructions for use',
        'AI Act Article 13: Transparency requirements',
        'GDPR Article 13: Transparency of automated processing'
      ],
      requirements: [
        'Dual transparency: Clinical AND AI limitations',
        'Combined training: Device operation AND AI model behaviour',
        'Joint governance: Medical and AI oversight mechanisms',
        'Unified communication: Clear, non-technical output explanation',
        'Integrated override procedures: Medical review AND algorithmic explanation'
      ],
      regulatoryText: 'Clinical decision support must communicate both medical confidence (sensitivity/specificity) and AI model confidence. Users must receive joint training on medical interpretation and AI system limitations. Override procedures must address both clinical concerns and algorithmic reliability.'
    }
  },
  {
    id: 'risk-management',
    name: 'Risk Management & Post-Market Monitoring',
    description: 'Continuous safety and performance monitoring systems',
    icon: 'Shield',
    mdrRequirements: {
      legislation: [
        'ISO 14971: Risk management for medical devices',
        'MDR Article 71: Post-market surveillance',
        'MDR Article 87: Serious incidents',
        'MDR Article 88: Periodic safety update reports'
      ],
      requirements: [
        'ISO 14971 risk management process',
        'Risk analysis for all device functions',
        'Risk control measures and verification',
        'Residual risk evaluation and acceptability assessment',
        'Risk management file maintenance',
        'Post-production information in risk management',
        'Periodic safety update reports',
        'Incident reporting and trend analysis'
      ],
      regulatoryText: 'Manufacturers must implement systematic risk management across the device lifecycle. All identified hazards must be analysed, risks quantified, and controls implemented. Post-market data must be continuously monitored for safety signals and used to update risk assessments. Serious incidents must be reported to regulatory authorities.'
    },
    aiActRequirements: {
      legislation: [
        'EU AI Act Article 9: Risk management system',
        'Article 29: Monitoring and logging',
        'Article 24: Documentation and record-keeping',
        'Article 25: Quality management system'
      ],
      requirements: [
        'AI-specific risk management system',
        'Monitoring for discrimination and fairness drift',
        'Detection of adversarial attacks or data poisoning',
        'Model performance degradation monitoring',
        'Documentation of AI-related incidents',
        'Governance for model updates and retraining',
        'Human feedback loops for continuous improvement'
      ],
      regulatoryText: 'AI systems require dedicated monitoring for algorithmic drift, bias emergence, and performance degradation. Manufacturers must establish feedback mechanisms detecting adverse model behaviour. All model updates must be validated before deployment. Documentation must record rationale for changes and evidence of validation.'
    },
    overlapRequirements: {
      legislation: [
        'MDR Article 61-88: Post-market surveillance requirements',
        'EU AI Act Article 26-29: Post-market monitoring',
        'ISO 14971 + AI-specific risk frameworks',
        'ETSI/CEN standards for AI governance'
      ],
      requirements: [
        'Unified incident reporting: Medical AND AI-related',
        'Dual performance dashboards: Clinical AND fairness metrics',
        'Integrated root cause analysis: Clinical AND algorithmic failures',
        'Joint governance committees: Medical experts AND AI specialists',
        'Coordinated corrective actions: Device modifications AND model retraining',
        'Synchronised reporting: MDR competent authority AND AI Act supervisory authority'
      ],
      regulatoryText: 'Post-market monitoring must establish unified surveillance covering both medical device performance and AI system behaviour. Incident reporting systems must capture clinical adverse events, algorithmic failures, bias emergence, and model drift. Root cause analysis must consider both medical and AI factors. Corrective action protocols must address integrated remediation. Regular review meetings must include both clinical and AI governance stakeholders.'
    }
  }
];

// Export individual framework areas for easy access
export const frameworkAreas = {
  mdr: {
    title: '📋 Medical Device Regulation (MDR)',
    description: 'Clinical validation, risk management, post-market surveillance',
    color: 'blue'
  },
  aiAct: {
    title: '🤖 EU AI Act',
    description: 'Risk management, training data documentation, human oversight, transparency',
    color: 'green'
  },
  overlap: {
    title: '⚖️ Overlap Zones',
    description: 'Integrated compliance strategies addressing both frameworks',
    color: 'purple'
  }
};