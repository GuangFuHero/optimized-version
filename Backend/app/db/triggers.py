"""SQL definitions and configuration for database-level triggers."""

# List of all database tables that should have mutation auditing enabled
AUDITED_TABLES = [
    # Core User & Auth tables
    "users",
    "user_identities",
    "user_contacts",

    # Geospatial and child inheritance tables
    "base_geometries",
    "stations",
    "closure_areas",
    "tickets",

    # Work assignment & routing
    "ticket_tasks",
    "task_assignments",
    "routes",
    "secondary_locations",

    # RBAC & Authorization tables
    "groups",
    "policies",
    "policy_user_assign",
    "policy_group_assign",
    "user_group_assign",
]

# PL/pgSQL function that serializes row mutations into JSONB, redacting password_hash
AUDIT_TRIGGER_FUNC_SQL = """
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
    user_id UUID := NULL;
    ip_addr VARCHAR := NULL;
    r_id UUID := NULL;
BEGIN
    -- Resolve context variables
    BEGIN
        user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id := NULL;
    END;

    BEGIN
        ip_addr := NULLIF(current_setting('app.client_ip', true), '');
    EXCEPTION WHEN OTHERS THEN
        ip_addr := NULL;
    END;

    -- Extract row identifier and states, redacting sensitive password_hash credentials
    IF TG_OP = 'DELETE' THEN
        r_id := OLD.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
    ELSIF TG_OP = 'UPDATE' THEN
        r_id := NEW.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
        new_val := to_jsonb(NEW) - 'password_hash';
    ELSE
        r_id := NEW.uuid;
        new_val := to_jsonb(NEW) - 'password_hash';
    END IF;

    -- Log to audit table
    INSERT INTO audit_logs (
        uuid,
        table_name,
        action,
        row_id,
        old_values,
        new_values,
        user_uuid,
        client_ip
    ) VALUES (
        gen_random_uuid(),
        TG_TABLE_NAME,
        TG_OP,
        r_id,
        old_val,
        new_val,
        user_id,
        ip_addr
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
"""

# PL/pgSQL function to raise an exception on updates or deletes
PROTECT_AUDIT_LOGS_FUNC_SQL = """
CREATE OR REPLACE FUNCTION protect_audit_logs_func()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs table is append-only. Updates and Deletes are forbidden.';
END;
$$ LANGUAGE plpgsql;
"""

# Before-trigger to prevent modifying or truncating the audit logs table
PROTECT_AUDIT_LOGS_TRIGGER_SQL = """
CREATE TRIGGER protect_audit_logs_trigger
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION protect_audit_logs_func();
"""


def get_audit_trigger_sql(table_name: str) -> str:
    """Generate trigger registration SQL for a target table."""
    return f"""
    CREATE TRIGGER audit_trigger_{table_name}
    AFTER INSERT OR UPDATE OR DELETE ON {table_name}
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();
    """
