const CP_REL_TYPE = {
    INCOMING: 1,
    OUTGOING: 2,
    TYPE_CONSTRAINT: 3,
    VALUE_TYPE_CONSTRAINT: 4,
}

const CC_REL_TYPE = {
    SUB_CLASS_OF: 1,
    EQUIVALENT_CLASS: 2,
}

const PP_REL_TYPE = {
    FOLLOWED_BY: 1,
    COMMON_SUBJECT: 2,
    COMMON_OBJECT: 3,
    SUB_PROPERTY_OF: 4,
}

const NS_STATS_TYPE = {
    CLASS: 1,
    SUBJECT: 2,
    OBJECT: 3,
}

module.exports = {
    CP_REL_TYPE,
    CC_REL_TYPE,
    PP_REL_TYPE,
    NS_STATS_TYPE,
}