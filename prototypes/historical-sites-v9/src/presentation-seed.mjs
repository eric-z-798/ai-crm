// Generated from docs/card-field-filter-examples.json; synthetic data only.
export const PRESENTATION_SEED = {
  "formatVersion": 1,
  "artifactStatus": "DESIGN_EXAMPLE_NOT_IMPLEMENTED",
  "allDataSynthetic": true,
  "catalogMode": "FIXED_ALLOWLIST_NOT_LOW_CODE",
  "queryRoot": "VISIT_PLAN",
  "fieldDefinitions": [
    {
      "fieldId": "hcp.name.current",
      "definitionVersion": 1,
      "conceptId": "hcp.name.current",
      "entity": "HCP",
      "valueType": "TEXT",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "医生姓名",
        "en": "Doctor name"
      },
      "definition": "医生姓名；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_TARGET_HCP_NAME",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [],
        "search": true,
        "sort": true
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "hco.name.current",
      "definitionVersion": 1,
      "conceptId": "hco.name.current",
      "entity": "HCO",
      "valueType": "REFERENCE",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "机构",
        "en": "Institution"
      },
      "definition": "机构；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_TARGET_HCO",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "in"
        ],
        "search": true,
        "sort": false
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "affiliation.department.current",
      "definitionVersion": 1,
      "conceptId": "affiliation.department.current",
      "entity": "HCP_HCO_AFFILIATION",
      "valueType": "TEXT",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "科室",
        "en": "Department"
      },
      "definition": "科室；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_TARGET_AFFILIATION_DEPARTMENT",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": true,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": true,
        "sort": false
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "affiliation.position.current",
      "definitionVersion": 1,
      "conceptId": "affiliation.position.current",
      "entity": "HCP_HCO_AFFILIATION",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "职务",
        "en": "Institutional position"
      },
      "definition": "本次目标HCP在本次目标HCO任职关系的明确职务；专业职称不进入本字段。",
      "resolverId": "PLAN_TARGET_AFFILIATION_POSITION",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "CONFIRMED_NONE"
      ],
      "capabilities": {
        "cardAuxiliary": true,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE",
      "enumRef": {
        "enumId": "institution-position",
        "version": 1
      }
    },
    {
      "fieldId": "hcp.professionalTitle.current",
      "definitionVersion": 1,
      "conceptId": "hcp.professionalTitle.current",
      "entity": "SOURCE_FACT",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "专业职称",
        "en": "Professional title"
      },
      "definition": "来源明确适用于该HCP的当前专业技术职称；不等于行政职务，不代表境外同名资质。",
      "resolverId": "PLAN_TARGET_AUTHORIZED_PROFESSIONAL_TITLE",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false,
        "subjectScope": "HCP_EXPLICIT_IN_THIS_FIXTURE"
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": true,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE",
      "enumRef": {
        "enumId": "professional-title",
        "version": 1
      }
    },
    {
      "fieldId": "hcp.genderRecorded.current",
      "definitionVersion": 1,
      "conceptId": "hcp.genderRecorded.current",
      "entity": "SOURCE_FACT",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "性别（来源记录）",
        "en": "Gender (source record)"
      },
      "definition": "来源明示的性别字段；保留sourceMeaning，不推断且不自动等同生理性别与性别认同。",
      "resolverId": "PLAN_TARGET_AUTHORIZED_RECORDED_GENDER",
      "temporalMode": "CURRENT_SOURCE",
      "sourcePolicy": {
        "allowedKinds": [
          "AUTHORIZED_SOURCE_FACT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false,
        "subjectScope": "HCP_EXPLICIT_IN_THIS_FIXTURE"
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED"
      ],
      "capabilities": {
        "cardAuxiliary": true,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE",
      "enumRef": {
        "enumId": "source-recorded-gender",
        "version": 1
      }
    },
    {
      "fieldId": "plan.scheduleDate",
      "definitionVersion": 1,
      "conceptId": "plan.scheduleDate",
      "entity": "VISIT_PLAN",
      "valueType": "DATE",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "计划日期",
        "en": "Plan date"
      },
      "definition": "计划日期；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_EFFECTIVE_SCHEDULE_DATE",
      "temporalMode": "CURRENT_PLAN",
      "sourcePolicy": {
        "allowedKinds": [
          "PLAN_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "dateRange",
          "isState",
          "datePreset"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE",
      "timeZone": "Asia/Shanghai"
    },
    {
      "fieldId": "plan.scheduleInstant",
      "definitionVersion": 1,
      "conceptId": "plan.scheduleInstant",
      "entity": "VISIT_PLAN",
      "valueType": "INSTANT",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "计划时间",
        "en": "Planned time"
      },
      "definition": "计划时间；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_EFFECTIVE_SCHEDULE_INSTANT",
      "temporalMode": "CURRENT_PLAN",
      "sourcePolicy": {
        "allowedKinds": [
          "PLAN_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [],
        "search": false,
        "sort": true
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "plan.scheduleState",
      "definitionVersion": 1,
      "conceptId": "plan.scheduleState",
      "entity": "VISIT_PLAN",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "安排状态",
        "en": "Arrangement status"
      },
      "definition": "安排状态；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "PLAN_EFFECTIVE_SCHEDULE_STATE",
      "temporalMode": "CURRENT_PLAN",
      "sourcePolicy": {
        "allowedKinds": [
          "PLAN_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN",
        "NOT_COLLECTED",
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "in"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE",
      "enumRef": {
        "enumId": "schedule-state",
        "version": 1
      }
    },
    {
      "fieldId": "visit.professionalTitle.atOccurrence",
      "definitionVersion": 1,
      "conceptId": "visit.professionalTitle.atOccurrence",
      "entity": "VISIT_REPORT",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "当时专业职称",
        "en": "Professional title at occurrence"
      },
      "definition": "当时专业职称；按固定解析器、来源与时态解释，不从其他字段推断。",
      "resolverId": "REPORTED_SUBJECT_TITLE_SNAPSHOT",
      "temporalMode": "OCCURRENCE_SNAPSHOT",
      "sourcePolicy": {
        "allowedKinds": [
          "REPORT_SNAPSHOT"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "UNKNOWN"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [],
        "search": false,
        "sort": false
      },
      "status": "RESERVED_NOT_ENABLED",
      "enumRef": {
        "enumId": "professional-title",
        "version": 1
      }
    },
    {
      "fieldId": "plan.lifecycle",
      "definitionVersion": 1,
      "conceptId": "plan.lifecycle",
      "entity": "VISIT_PLAN",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "计划状态",
        "en": "Plan status"
      },
      "definition": "计划状态；与安排、实际和记录其他状态分别解释。",
      "enumRef": {
        "enumId": "plan-state",
        "version": 1
      },
      "resolverId": "PLAN_LIFECYCLE",
      "temporalMode": "CURRENT_RECORD",
      "sourcePolicy": {
        "allowedKinds": [
          "LOCAL_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "visit.actualOutcome",
      "definitionVersion": 1,
      "conceptId": "visit.actualOutcome",
      "entity": "VISIT_PLAN",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "实际结果",
        "en": "Actual outcome"
      },
      "definition": "实际结果；与安排、实际和记录其他状态分别解释。",
      "enumRef": {
        "enumId": "actual-outcome",
        "version": 1
      },
      "resolverId": "REPORTED_OUTCOME_PROJECTION",
      "temporalMode": "CURRENT_RECORD",
      "sourcePolicy": {
        "allowedKinds": [
          "LOCAL_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE"
    },
    {
      "fieldId": "visit.reportingState",
      "definitionVersion": 1,
      "conceptId": "visit.reportingState",
      "entity": "VISIT_PLAN",
      "valueType": "ENUM",
      "cardinality": "ONE",
      "labels": {
        "zh-CN": "记录状态",
        "en": "Report state"
      },
      "definition": "记录状态；与安排、实际和记录其他状态分别解释。",
      "enumRef": {
        "enumId": "reporting-state",
        "version": 1
      },
      "resolverId": "REPORTING_STATE_PROJECTION",
      "temporalMode": "CURRENT_RECORD",
      "sourcePolicy": {
        "allowedKinds": [
          "LOCAL_RECORD"
        ],
        "requireSourceForKnown": true,
        "conflictResult": "UNKNOWN",
        "inferAllowed": false
      },
      "nullPolicy": [
        "NOT_APPLICABLE"
      ],
      "capabilities": {
        "cardAuxiliary": false,
        "filterOps": [
          "in",
          "isState"
        ],
        "search": false,
        "sort": false
      },
      "status": "ACTIVE"
    }
  ],
  "enumDefinitions": [
    {
      "enumId": "professional-title",
      "version": 1,
      "options": [
        {
          "code": "PT_ATTENDING",
          "labels": {
            "zh-CN": "主治医师",
            "en": "Attending physician (source label)"
          }
        },
        {
          "code": "PT_ASSOCIATE_CHIEF",
          "labels": {
            "zh-CN": "副主任医师",
            "en": "Associate chief physician (source label)"
          }
        },
        {
          "code": "PT_CHIEF",
          "labels": {
            "zh-CN": "主任医师",
            "en": "Chief physician (source label)"
          }
        }
      ]
    },
    {
      "enumId": "institution-position",
      "version": 1,
      "options": [
        {
          "code": "POS_DEPUTY_HEAD",
          "labels": {
            "zh-CN": "科室副主任",
            "en": "Deputy department head"
          }
        },
        {
          "code": "POS_HEAD",
          "labels": {
            "zh-CN": "科室主任",
            "en": "Department head"
          }
        },
        {
          "code": "POS_TEACHING_SECRETARY",
          "labels": {
            "zh-CN": "教学秘书",
            "en": "Teaching secretary"
          }
        },
        {
          "code": "POS_CLINICAL_TEACHING_LEAD",
          "labels": {
            "zh-CN": "临床教学负责人",
            "en": "Clinical teaching lead"
          }
        },
        {
          "code": "POS_GUEST_OUTPATIENT",
          "labels": {
            "zh-CN": "特邀门诊医师",
            "en": "Guest outpatient physician"
          }
        }
      ]
    },
    {
      "enumId": "source-recorded-gender",
      "version": 1,
      "options": [
        {
          "code": "G_FEMALE",
          "labels": {
            "zh-CN": "女（来源记录）",
            "en": "Female (recorded by source)"
          }
        },
        {
          "code": "G_MALE",
          "labels": {
            "zh-CN": "男（来源记录）",
            "en": "Male (recorded by source)"
          }
        },
        {
          "code": "G_OTHER_DECLARED",
          "labels": {
            "zh-CN": "其他（明确来源）",
            "en": "Other (explicitly recorded)"
          }
        }
      ]
    },
    {
      "enumId": "schedule-state",
      "version": 1,
      "options": [
        {
          "code": "UNSCHEDULED",
          "labels": {
            "zh-CN": "待安排",
            "en": "Unscheduled"
          }
        },
        {
          "code": "CONFIRMED",
          "labels": {
            "zh-CN": "安排已确认",
            "en": "Confirmed arrangement"
          }
        },
        {
          "code": "RESCHEDULE_PENDING",
          "labels": {
            "zh-CN": "改期待确认",
            "en": "Reschedule pending"
          }
        },
        {
          "code": "PROPOSED",
          "labels": {
            "zh-CN": "时间待确认",
            "en": "Proposed, not confirmed"
          }
        }
      ]
    },
    {
      "enumId": "plan-state",
      "version": 1,
      "options": [
        {
          "code": "DRAFT",
          "labels": {
            "zh-CN": "计划草稿",
            "en": "Plan draft"
          }
        },
        {
          "code": "ACTIVE",
          "labels": {
            "zh-CN": "有效计划",
            "en": "Active plan"
          }
        },
        {
          "code": "CANCELLED",
          "labels": {
            "zh-CN": "计划已取消",
            "en": "Cancelled plan"
          }
        }
      ]
    },
    {
      "enumId": "actual-outcome",
      "version": 1,
      "options": [
        {
          "code": "NOT_RECORDED",
          "labels": {
            "zh-CN": "尚未记录实际",
            "en": "Actual not recorded"
          }
        },
        {
          "code": "MET",
          "labels": {
            "zh-CN": "已交流",
            "en": "Met"
          }
        },
        {
          "code": "NOT_MET",
          "labels": {
            "zh-CN": "到院未见到",
            "en": "Arrived, not met"
          }
        }
      ]
    },
    {
      "enumId": "reporting-state",
      "version": 1,
      "options": [
        {
          "code": "NONE",
          "labels": {
            "zh-CN": "尚无记录",
            "en": "No report"
          }
        },
        {
          "code": "DRAFT",
          "labels": {
            "zh-CN": "记录草稿",
            "en": "Report draft"
          }
        },
        {
          "code": "SAVED",
          "labels": {
            "zh-CN": "已保存记录",
            "en": "Saved report"
          }
        },
        {
          "code": "SAVED_WITH_DRAFT",
          "labels": {
            "zh-CN": "已保存，另有更正草稿",
            "en": "Saved with correction draft"
          }
        }
      ]
    }
  ],
  "tenants": [
    {
      "tenantId": "tenant-demo-01",
      "displayName": "衡川制药（虚构）",
      "activeConfigVersion": 1,
      "catalogVersion": 1,
      "policyEpoch": 1,
      "businessContextVersionIndependent": true,
      "catalog": [
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "hcp.name.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "search",
              "sort"
            ],
            "MANAGER": [
              "read",
              "search",
              "sort"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "hco.name.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter",
              "search"
            ],
            "MANAGER": [
              "read",
              "filter",
              "search"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "affiliation.department.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter",
              "search"
            ],
            "MANAGER": [
              "read",
              "filter",
              "search"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "affiliation.position.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "hcp.professionalTitle.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "hcp.genderRecorded.current",
          "definitionVersion": 1,
          "enabled": false,
          "grantsCeiling": {
            "REP": [],
            "MANAGER": [],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "NOT_ENABLED_BY_DEFAULT"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "plan.scheduleDate",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "plan.scheduleInstant",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "sort"
            ],
            "MANAGER": [
              "read",
              "sort"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "plan.scheduleState",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "visit.professionalTitle.atOccurrence",
          "definitionVersion": 1,
          "enabled": false,
          "grantsCeiling": {
            "REP": [],
            "MANAGER": [],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "plan.lifecycle",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "visit.actualOutcome",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-01",
          "fieldId": "visit.reportingState",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        }
      ],
      "roleViews": [
        {
          "roleView": "REP",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "OWN_ASSIGNED_PLAN_CONTAINERS",
          "cardLayout": {
            "layoutId": "tenant-demo-01-rep",
            "version": 1,
            "coreSlots": [
              "TARGET_IDENTITY",
              "TARGET_INSTITUTION",
              "TIME_AND_ARRANGEMENT_STATE",
              "WORK_REASON",
              "RECORD_AND_FOLLOWUP_STATE",
              "PRIMARY_ACTION"
            ],
            "auxiliaryFieldIds": [
              "hcp.professionalTitle.current",
              "affiliation.position.current"
            ],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [
              "plan.scheduleDate",
              "plan.lifecycle"
            ],
            "allowedFieldIds": [
              "plan.scheduleDate",
              "plan.scheduleState",
              "hco.name.current",
              "affiliation.department.current",
              "hcp.professionalTitle.current",
              "affiliation.position.current",
              "plan.lifecycle",
              "visit.actualOutcome",
              "visit.reportingState"
            ],
            "searchFieldIds": [
              "hcp.name.current",
              "hco.name.current",
              "affiliation.department.current"
            ],
            "sortFieldIds": [
              "plan.scheduleInstant",
              "hcp.name.current"
            ],
            "defaultSort": [
              {
                "fieldId": "plan.scheduleInstant",
                "direction": "ASC"
              }
            ],
            "dynamicFacetCounts": false,
            "quickFieldIds": [
              "hco.name.current",
              "plan.scheduleState"
            ],
            "defaultFilter": {
              "all": [
                {
                  "fieldId": "plan.scheduleDate",
                  "definitionVersion": 1,
                  "op": "datePreset",
                  "preset": "TODAY",
                  "timeZone": "Asia/Shanghai"
                },
                {
                  "fieldId": "plan.lifecycle",
                  "definitionVersion": 1,
                  "enumVersion": 1,
                  "op": "in",
                  "values": [
                    "DRAFT",
                    "ACTIVE"
                  ],
                  "includeStates": [
                    "NOT_APPLICABLE"
                  ]
                }
              ]
            }
          },
          "dataMode": "SYNTHETIC_DEMO"
        },
        {
          "roleView": "MANAGER",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "PLAN_CONTAINERS_WITH_AUTHORIZED_OPEN_EXPLICIT_REQUEST",
          "cardLayout": {
            "layoutId": "tenant-demo-01-manager",
            "version": 1,
            "coreSlots": [
              "TARGET_IDENTITY",
              "TARGET_INSTITUTION",
              "TIME_AND_ARRANGEMENT_STATE",
              "WORK_REASON",
              "RECORD_AND_FOLLOWUP_STATE",
              "PRIMARY_ACTION"
            ],
            "auxiliaryFieldIds": [
              "hcp.professionalTitle.current",
              "affiliation.department.current"
            ],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [],
            "allowedFieldIds": [
              "plan.scheduleDate",
              "plan.scheduleState",
              "hco.name.current",
              "affiliation.department.current",
              "hcp.professionalTitle.current",
              "affiliation.position.current",
              "plan.lifecycle",
              "visit.actualOutcome",
              "visit.reportingState"
            ],
            "searchFieldIds": [
              "hcp.name.current",
              "hco.name.current",
              "affiliation.department.current"
            ],
            "sortFieldIds": [
              "plan.scheduleInstant",
              "hcp.name.current"
            ],
            "defaultSort": [
              {
                "fieldId": "plan.scheduleInstant",
                "direction": "ASC"
              }
            ],
            "dynamicFacetCounts": false,
            "quickFieldIds": [
              "hco.name.current",
              "plan.scheduleState"
            ],
            "defaultFilter": {
              "all": []
            },
            "scopePreset": "AUTHORIZED_OPEN_EXPLICIT_REQUESTS_ALL_PLAN_DATES"
          },
          "dataMode": "SYNTHETIC_DEMO"
        },
        {
          "roleView": "ADMIN",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "NO_BUSINESS_ROWS",
          "cardLayout": {
            "layoutId": "tenant-demo-01-admin",
            "version": 1,
            "coreSlots": [],
            "auxiliaryFieldIds": [],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [],
            "allowedFieldIds": [],
            "searchFieldIds": [],
            "sortFieldIds": [],
            "defaultSort": [],
            "dynamicFacetCounts": false
          },
          "dataMode": "SYNTHETIC_PREVIEW_ONLY",
          "preview": {
            "allowedRoleViews": [
              "REP",
              "MANAGER",
              "ADMIN"
            ],
            "dataSource": "PUBLIC_SYNTHETIC_PREVIEW_FIXTURE",
            "impersonatesProductionIdentity": false,
            "publishMayExpandPermissions": false
          }
        }
      ],
      "principals": {
        "REP": "rep-chen-xiao",
        "MANAGER": "manager-zhou-min",
        "ADMIN": "admin-he-ran"
      },
      "teamId": "team-hospital-01",
      "optionalGenderPreview": {
        "enabledByDefault": false,
        "syntheticOnly": true,
        "eligibleRoleViews": [],
        "activationRequires": [
          "SEPARATE_PURPOSE_AND_SOURCE_REVIEW",
          "EXPLICIT_POLICY_READ_FILTER_GRANT",
          "PUBLISHED_PRESENTATION_REFERENCES"
        ],
        "adminLayoutEditAloneCanGrant": false
      }
    },
    {
      "tenantId": "tenant-demo-02",
      "displayName": "澄越制药（虚构）",
      "activeConfigVersion": 1,
      "catalogVersion": 1,
      "policyEpoch": 1,
      "businessContextVersionIndependent": true,
      "catalog": [
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "hcp.name.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "search",
              "sort"
            ],
            "MANAGER": [
              "read",
              "search",
              "sort"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "hco.name.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter",
              "search"
            ],
            "MANAGER": [
              "read",
              "filter",
              "search"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "affiliation.department.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter",
              "search"
            ],
            "MANAGER": [
              "read",
              "filter",
              "search"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "affiliation.position.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "hcp.professionalTitle.current",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "hcp.genderRecorded.current",
          "definitionVersion": 1,
          "enabled": false,
          "grantsCeiling": {
            "REP": [],
            "MANAGER": [],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "NOT_ENABLED_BY_DEFAULT"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "plan.scheduleDate",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "plan.scheduleInstant",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "sort"
            ],
            "MANAGER": [
              "read",
              "sort"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "plan.scheduleState",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "visit.professionalTitle.atOccurrence",
          "definitionVersion": 1,
          "enabled": false,
          "grantsCeiling": {
            "REP": [],
            "MANAGER": [],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "plan.lifecycle",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "visit.actualOutcome",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        },
        {
          "tenantId": "tenant-demo-02",
          "fieldId": "visit.reportingState",
          "definitionVersion": 1,
          "enabled": true,
          "grantsCeiling": {
            "REP": [
              "read",
              "filter"
            ],
            "MANAGER": [
              "read",
              "filter"
            ],
            "ADMIN": [
              "configureMetadata"
            ]
          },
          "grantAuthority": "DEMO_POLICY_FIXTURE_ONLY",
          "purposeBasis": "SYNTHETIC_VISIT_WORKFLOW"
        }
      ],
      "roleViews": [
        {
          "roleView": "REP",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "OWN_ASSIGNED_PLAN_CONTAINERS",
          "cardLayout": {
            "layoutId": "tenant-demo-02-rep",
            "version": 1,
            "coreSlots": [
              "TARGET_IDENTITY",
              "TARGET_INSTITUTION",
              "TIME_AND_ARRANGEMENT_STATE",
              "WORK_REASON",
              "RECORD_AND_FOLLOWUP_STATE",
              "PRIMARY_ACTION"
            ],
            "auxiliaryFieldIds": [
              "affiliation.department.current",
              "hcp.professionalTitle.current"
            ],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [
              "plan.scheduleDate",
              "plan.lifecycle"
            ],
            "allowedFieldIds": [
              "plan.scheduleDate",
              "plan.scheduleState",
              "hco.name.current",
              "affiliation.department.current",
              "hcp.professionalTitle.current",
              "affiliation.position.current",
              "plan.lifecycle",
              "visit.actualOutcome",
              "visit.reportingState"
            ],
            "searchFieldIds": [
              "hcp.name.current",
              "hco.name.current",
              "affiliation.department.current"
            ],
            "sortFieldIds": [
              "plan.scheduleInstant",
              "hcp.name.current"
            ],
            "defaultSort": [
              {
                "fieldId": "plan.scheduleInstant",
                "direction": "ASC"
              }
            ],
            "dynamicFacetCounts": false,
            "quickFieldIds": [
              "hco.name.current",
              "plan.scheduleState"
            ],
            "defaultFilter": {
              "all": [
                {
                  "fieldId": "plan.scheduleDate",
                  "definitionVersion": 1,
                  "op": "datePreset",
                  "preset": "TODAY",
                  "timeZone": "Asia/Shanghai"
                },
                {
                  "fieldId": "plan.lifecycle",
                  "definitionVersion": 1,
                  "enumVersion": 1,
                  "op": "in",
                  "values": [
                    "DRAFT",
                    "ACTIVE"
                  ],
                  "includeStates": [
                    "NOT_APPLICABLE"
                  ]
                }
              ]
            }
          },
          "dataMode": "SYNTHETIC_DEMO"
        },
        {
          "roleView": "MANAGER",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "PLAN_CONTAINERS_WITH_AUTHORIZED_OPEN_EXPLICIT_REQUEST",
          "cardLayout": {
            "layoutId": "tenant-demo-02-manager",
            "version": 1,
            "coreSlots": [
              "TARGET_IDENTITY",
              "TARGET_INSTITUTION",
              "TIME_AND_ARRANGEMENT_STATE",
              "WORK_REASON",
              "RECORD_AND_FOLLOWUP_STATE",
              "PRIMARY_ACTION"
            ],
            "auxiliaryFieldIds": [
              "hcp.professionalTitle.current",
              "affiliation.position.current"
            ],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [],
            "allowedFieldIds": [
              "plan.scheduleDate",
              "plan.scheduleState",
              "hco.name.current",
              "affiliation.department.current",
              "hcp.professionalTitle.current",
              "affiliation.position.current",
              "plan.lifecycle",
              "visit.actualOutcome",
              "visit.reportingState"
            ],
            "searchFieldIds": [
              "hcp.name.current",
              "hco.name.current",
              "affiliation.department.current"
            ],
            "sortFieldIds": [
              "plan.scheduleInstant",
              "hcp.name.current"
            ],
            "defaultSort": [
              {
                "fieldId": "plan.scheduleInstant",
                "direction": "ASC"
              }
            ],
            "dynamicFacetCounts": false,
            "quickFieldIds": [
              "hco.name.current",
              "plan.scheduleState"
            ],
            "defaultFilter": {
              "all": []
            },
            "scopePreset": "AUTHORIZED_OPEN_EXPLICIT_REQUESTS_ALL_PLAN_DATES"
          },
          "dataMode": "SYNTHETIC_DEMO"
        },
        {
          "roleView": "ADMIN",
          "root": "VISIT_PLAN",
          "countUnit": "DISTINCT_PLAN_OR_UNPLANNED_CONTAINER_ID",
          "rowScope": "NO_BUSINESS_ROWS",
          "cardLayout": {
            "layoutId": "tenant-demo-02-admin",
            "version": 1,
            "coreSlots": [],
            "auxiliaryFieldIds": [],
            "maxAuxiliaryFields": 2,
            "overflow": "EXPAND_AUTHORIZED_DETAILS"
          },
          "filterConfig": {
            "version": 1,
            "defaultFieldIds": [],
            "allowedFieldIds": [],
            "searchFieldIds": [],
            "sortFieldIds": [],
            "defaultSort": [],
            "dynamicFacetCounts": false
          },
          "dataMode": "SYNTHETIC_PREVIEW_ONLY",
          "preview": {
            "allowedRoleViews": [
              "REP",
              "MANAGER",
              "ADMIN"
            ],
            "dataSource": "PUBLIC_SYNTHETIC_PREVIEW_FIXTURE",
            "impersonatesProductionIdentity": false,
            "publishMayExpandPermissions": false
          }
        }
      ],
      "principals": {
        "REP": "rep-sun-yue",
        "MANAGER": "manager-lu-chen",
        "ADMIN": "admin-jiang-yu"
      },
      "teamId": "team-hospital-02",
      "optionalGenderPreview": {
        "enabledByDefault": false,
        "syntheticOnly": true,
        "eligibleRoleViews": [
          "REP"
        ],
        "activationRequires": [
          "SEPARATE_PURPOSE_AND_SOURCE_REVIEW",
          "EXPLICIT_POLICY_READ_FILTER_GRANT",
          "PUBLISHED_PRESENTATION_REFERENCES"
        ],
        "adminLayoutEditAloneCanGrant": false
      }
    }
  ],
  "sampleResolvedRows": [
    {
      "tenantId": "tenant-demo-01",
      "planId": "plan-day-01",
      "targetHcpId": "hcp-li-ming",
      "targetHcoId": "hco-hechuan",
      "hcoLabel": "和川医院",
      "affiliationId": "aff-li-hechuan",
      "productIds": [
        "product-demo-a"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "李明"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-hechuan"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "心内科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_CHIEF"
        },
        "affiliation.position.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "POS_DEPUTY_HEAD"
        },
        "hcp.genderRecorded.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "CONFIRMED"
        },
        "plan.scheduleInstant": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20T09:30:00+08:00"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    },
    {
      "tenantId": "tenant-demo-01",
      "planId": "plan-day-02",
      "targetHcpId": "hcp-zhao-ning",
      "targetHcoId": "hco-hechuan",
      "hcoLabel": "和川医院",
      "affiliationId": "aff-zhao-hechuan",
      "productIds": [
        "product-demo-a"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "赵宁"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-hechuan"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "心内科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_ASSOCIATE_CHIEF"
        },
        "affiliation.position.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "hcp.genderRecorded.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "CONFIRMED"
        },
        "plan.scheduleInstant": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20T11:00:00+08:00"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    },
    {
      "tenantId": "tenant-demo-01",
      "planId": "plan-day-03",
      "targetHcpId": "hcp-wang-qing",
      "targetHcoId": "hco-xincheng",
      "hcoLabel": "新城医院",
      "affiliationId": "aff-wang-xincheng",
      "productIds": [
        "product-demo-b"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "王青"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-xincheng"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "内科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_ATTENDING"
        },
        "affiliation.position.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "POS_TEACHING_SECRETARY"
        },
        "hcp.genderRecorded.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-A-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "CONFIRMED"
        },
        "plan.scheduleInstant": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20T14:30:00+08:00"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-day-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    },
    {
      "tenantId": "tenant-demo-02",
      "planId": "plan-b-01",
      "targetHcpId": "hcp-he-jing",
      "targetHcoId": "hco-chenan",
      "hcoLabel": "晨安医院",
      "affiliationId": "aff-he-chenan",
      "productIds": [
        "product-demo-c"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "何静"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-chenan"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "内分泌科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_CHIEF"
        },
        "affiliation.position.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "POS_DEPUTY_HEAD"
        },
        "hcp.genderRecorded.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "G_FEMALE",
          "sourceMeaning": "合成档案明示的性别字段；不推断、不与其他性别概念自动合并"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "CONFIRMED"
        },
        "plan.scheduleInstant": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20T09:00:00+08:00"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-01-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    },
    {
      "tenantId": "tenant-demo-02",
      "planId": "plan-b-02",
      "targetHcpId": "hcp-sun-zhuo",
      "targetHcoId": "hco-chenan",
      "hcoLabel": "晨安医院",
      "affiliationId": "aff-sun-chenan",
      "productIds": [
        "product-demo-c"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "孙卓"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-chenan"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "呼吸科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_ASSOCIATE_CHIEF"
        },
        "affiliation.position.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "POS_CLINICAL_TEACHING_LEAD"
        },
        "hcp.genderRecorded.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "CONFIRMED"
        },
        "plan.scheduleInstant": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20T11:00:00+08:00"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-02-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    },
    {
      "tenantId": "tenant-demo-02",
      "planId": "plan-b-03",
      "targetHcpId": "hcp-liang-wen",
      "targetHcoId": "hco-yuanning",
      "hcoLabel": "远宁医院",
      "affiliationId": "aff-liang-yuanning",
      "productIds": [
        "product-demo-d"
      ],
      "occurrence": null,
      "report": null,
      "commitments": [],
      "values": {
        "hcp.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "梁文"
        },
        "hco.name.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "hco-yuanning"
        },
        "affiliation.department.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "普通内科"
        },
        "hcp.professionalTitle.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PT_ATTENDING"
        },
        "affiliation.position.current": {
          "status": "NOT_COLLECTED",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "hcp.genderRecorded.current": {
          "status": "KNOWN",
          "sourceRef": "demo-profile-B-v1",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "G_MALE",
          "sourceMeaning": "合成档案明示的性别字段；不推断、不与其他性别概念自动合并"
        },
        "plan.lifecycle": {
          "status": "KNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "ACTIVE"
        },
        "plan.scheduleDate": {
          "status": "KNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "2026-10-20"
        },
        "plan.scheduleState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "PROPOSED"
        },
        "plan.scheduleInstant": {
          "status": "UNKNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z"
        },
        "visit.actualOutcome": {
          "status": "KNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NOT_RECORDED"
        },
        "visit.reportingState": {
          "status": "KNOWN",
          "sourceRef": "plan-b-03-fixture",
          "sourceVersion": 1,
          "checkedAt": "2026-10-12T08:00:00Z",
          "value": "NONE"
        }
      },
      "sourceDataNotAuthorizedResponse": true
    }
  ],
  "relationCounterexample": {
    "tenantId": "tenant-demo-01",
    "targetHcpId": "hcp-li-ming",
    "affiliations": [
      {
        "id": "aff-li-hechuan",
        "hcoId": "hco-hechuan",
        "department": "心内科",
        "position": "POS_DEPUTY_HEAD"
      },
      {
        "id": "aff-li-anlan",
        "hcoId": "hco-anlan",
        "department": "心内科",
        "position": "POS_GUEST_OUTPATIENT"
      }
    ],
    "query": {
      "hcoId": "hco-anlan",
      "position": "POS_DEPUTY_HEAD"
    },
    "expectedMatches": 0,
    "reason": "HCO与position必须落在同一任职关系；不能跨两条exists拼接",
    "addsSeedPlan": false,
    "inheritsActivityEligibility": false
  },
  "sampleSavedView": {
    "viewId": "personal-view-a-01",
    "tenantId": "tenant-demo-01",
    "principalId": "rep-chen-xiao",
    "roleView": "REP",
    "revision": 1,
    "configVersion": 1,
    "state": "VALID",
    "name": "和川已确认安排",
    "query": {
      "root": "VISIT_PLAN",
      "filter": {
        "all": [
          {
            "fieldId": "hco.name.current",
            "definitionVersion": 1,
            "op": "in",
            "values": [
              "hco-hechuan"
            ]
          },
          {
            "fieldId": "plan.scheduleState",
            "definitionVersion": 1,
            "enumVersion": 1,
            "op": "in",
            "values": [
              "CONFIRMED"
            ]
          }
        ]
      },
      "sort": [
        {
          "fieldId": "plan.scheduleInstant",
          "direction": "ASC"
        }
      ]
    },
    "containsResults": false
  },
  "productionClaims": {
    "serverAuthorization": false,
    "tenantIsolation": false,
    "liveSources": false,
    "browserQA": false,
    "credentialsCreated": false,
    "externalCalls": 0
  },
  "productContract": "product-prd.md v0.19 section 0.10",
  "missingnessCounterexamples": [
    {
      "fieldId": "affiliation.position.current",
      "value": {
        "status": "UNKNOWN",
        "sourceRef": "missingness-negative-example",
        "sourceVersion": 1,
        "checkedAt": "2026-10-12T08:00:00Z"
      },
      "notPartOfSeedWorld": true
    },
    {
      "fieldId": "affiliation.position.current",
      "value": {
        "status": "NOT_COLLECTED",
        "sourceRef": "missingness-negative-example",
        "sourceVersion": 1,
        "checkedAt": "2026-10-12T08:00:00Z"
      },
      "notPartOfSeedWorld": true
    },
    {
      "fieldId": "affiliation.position.current",
      "value": {
        "status": "CONFIRMED_NONE",
        "sourceRef": "missingness-negative-example",
        "sourceVersion": 1,
        "checkedAt": "2026-10-12T08:00:00Z"
      },
      "notPartOfSeedWorld": true
    }
  ],
  "optionalGenderActivationExample": {
    "tenantId": "tenant-demo-02",
    "newConfigVersion": 2,
    "policyGrantRef": "explicit-synthetic-gender-test-approval",
    "newPolicyEpoch": 2,
    "roleView": "REP",
    "fieldId": "hcp.genderRecorded.current",
    "grant": [
      "read",
      "filter"
    ],
    "cardLayoutOptionalSlot": [
      "hcp.professionalTitle.current",
      "hcp.genderRecorded.current"
    ],
    "filterAdded": [
      "hcp.genderRecorded.current"
    ],
    "managerGrant": [],
    "adminBusinessReadGrant": [],
    "autoEnabled": false,
    "productionApprovalExists": false
  },
  "queryConditionSemantics": {
    "betweenFields": "AND",
    "withinFieldValuesAndIncludeStates": "OR",
    "duplicateFieldConditions": "REJECT",
    "emptyCondition": "REJECT",
    "missingValueMatchesNegation": false,
    "lookupRelationship": "SAME_AFFILIATION_BOUND_TO_PLAN_TARGET",
    "genderDefault": "DISABLED"
  }
};
