"""schema_v2_ticket_tasks_property_configs

Revision ID: schema_v2
Revises: ecff746c61a6
Create Date: 2026-04-09

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'schema_v2'
down_revision: str | Sequence[str] | None = 'ecff746c61a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old ticket sub-tables (order matters for FK constraints)
    op.drop_table('supply_task_items')
    op.drop_table('hr_task_specialties')
    op.drop_table('request_photos')
    op.drop_table('supply_requirements')
    op.drop_table('hr_requirements')

    # Add missing columns to stations
    op.add_column('stations', sa.Column('child_station_uuid', sa.UUID(), nullable=True))
    op.add_column('stations', sa.Column('type', sa.String(50), nullable=True))
    op.add_column('stations', sa.Column('name', sa.String(), nullable=True))
    op.add_column('stations', sa.Column('description', sa.String(), nullable=True))
    op.add_column('stations', sa.Column('source', sa.String(50), nullable=True))
    op.add_column('stations', sa.Column('visibility', sa.String(50), nullable=True))
    op.add_column('stations', sa.Column('verification_status', sa.String(50), nullable=True))
    op.add_column('stations', sa.Column('confidence_score', sa.Float(), nullable=True))
    op.add_column('stations', sa.Column('is_duplicate', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('stations', sa.Column('dedup_group_id', sa.String(), nullable=True))
    op.add_column('stations', sa.Column('is_temporary', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('stations', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('stations', sa.Column('is_official', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('stations', sa.Column('priority_score', sa.Float(), nullable=True))
    op.add_column('stations', sa.Column('updated_by', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'stations', 'stations', ['child_station_uuid'], ['uuid'])
    op.create_foreign_key(None, 'stations', 'users', ['updated_by'], ['uuid'])

    # Add missing columns to tickets
    op.add_column('tickets', sa.Column('task_type', sa.String(50), nullable=True))
    op.add_column('tickets', sa.Column('visibility', sa.String(50), nullable=True))
    op.add_column('tickets', sa.Column('verification_status', sa.String(50), nullable=True))
    op.add_column('tickets', sa.Column('review_note', sa.String(), nullable=True))

    # Remove address columns from base_geometries
    op.drop_column('base_geometries', 'county')
    op.drop_column('base_geometries', 'city')
    op.drop_column('base_geometries', 'lane')
    op.drop_column('base_geometries', 'alley')
    op.drop_column('base_geometries', 'no')
    op.drop_column('base_geometries', 'floor')
    op.drop_column('base_geometries', 'room')

    # Create photos (before secondary_locations due to pole_photo_uuid reference)
    op.create_table('photos',
        sa.Column('ref_uuid', sa.String(), nullable=False),
        sa.Column('ref_type', sa.String(50), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create secondary_locations
    op.create_table('secondary_locations',
        sa.Column('geometry_uuid', sa.UUID(), nullable=False),
        sa.Column('location_type', sa.String(50), nullable=False),
        sa.Column('county', sa.String(50), nullable=True),
        sa.Column('city', sa.String(50), nullable=True),
        sa.Column('lane', sa.String(20), nullable=True),
        sa.Column('alley', sa.String(20), nullable=True),
        sa.Column('no', sa.String(20), nullable=True),
        sa.Column('floor', sa.String(20), nullable=True),
        sa.Column('room', sa.String(20), nullable=True),
        sa.Column('pole_id', sa.String(50), nullable=True),
        sa.Column('pole_type', sa.String(50), nullable=True),
        sa.Column('pole_photo_uuid', sa.String(), nullable=True),
        sa.Column('pole_note', sa.String(), nullable=True),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['geometry_uuid'], ['base_geometries.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create routes
    op.create_table('routes',
        sa.Column('origin_uuid', sa.UUID(), nullable=False),
        sa.Column('destination_uuid', sa.UUID(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['origin_uuid'], ['base_geometries.uuid']),
        sa.ForeignKeyConstraint(['destination_uuid'], ['base_geometries.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create ticket_tasks
    op.create_table('ticket_tasks',
        sa.Column('ticket_uuid', sa.UUID(), nullable=False),
        sa.Column('route_uuid', sa.UUID(), nullable=True),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('task_name', sa.String(200), nullable=False),
        sa.Column('task_description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('source', sa.String(50), nullable=False, server_default='user'),
        sa.Column('progress_note', sa.String(), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=True),
        sa.Column('is_duplicate', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dedup_group_id', sa.String(), nullable=True),
        sa.Column('moderation_status', sa.String(50), nullable=False, server_default='pending_review'),
        sa.Column('visibility', sa.String(50), nullable=False, server_default='public'),
        sa.Column('review_note', sa.String(), nullable=True),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['ticket_uuid'], ['tickets.uuid']),
        sa.ForeignKeyConstraint(['route_uuid'], ['routes.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create task_properties
    op.create_table('task_properties',
        sa.Column('task_uuid', sa.UUID(), nullable=False),
        sa.Column('property_name', sa.String(100), nullable=False),
        sa.Column('property_value', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('comment', sa.String(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['task_uuid'], ['ticket_tasks.uuid']),
        sa.ForeignKeyConstraint(['created_by'], ['users.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create task_assignments
    op.create_table('task_assignments',
        sa.Column('task_uuid', sa.UUID(), nullable=False),
        sa.Column('actor_uuid', sa.UUID(), nullable=False),
        sa.Column('role', sa.String(100), nullable=True),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['task_uuid'], ['ticket_tasks.uuid']),
        sa.ForeignKeyConstraint(['actor_uuid'], ['users.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create station_property_config
    op.create_table('station_property_config',
        sa.Column('station_type', sa.String(50), nullable=False),
        sa.Column('property_name', sa.String(100), nullable=False),
        sa.Column('data_type', sa.String(50), nullable=False),
        sa.Column('enum_options', sa.JSON(), nullable=True),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Create task_property_config
    op.create_table('task_property_config',
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('property_name', sa.String(100), nullable=False),
        sa.Column('data_type', sa.String(50), nullable=False),
        sa.Column('enum_options', sa.JSON(), nullable=True),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint('uuid'),
    )

    # Seed station_property_config
    op.execute("""
    INSERT INTO station_property_config (uuid, station_type, property_name, data_type, enum_options) VALUES
    (gen_random_uuid(), 'all', 'crowd_level', 'Enum', '["low","medium","high"]'),
    (gen_random_uuid(), 'water', 'is_potable', 'Boolean', NULL),
    (gen_random_uuid(), 'water', 'water_level', 'Enum', '["full","partial","empty"]'),
    (gen_random_uuid(), 'shelter', 'capacity_total', 'Integer', NULL),
    (gen_random_uuid(), 'shelter', 'beds_available', 'Integer', NULL),
    (gen_random_uuid(), 'shelter', 'pet_friendly', 'Boolean', NULL),
    (gen_random_uuid(), 'shelter', 'vulnerable_priority', 'Boolean', NULL),
    (gen_random_uuid(), 'shelter', 'has_medical_support', 'Boolean', NULL),
    (gen_random_uuid(), 'shelter', 'long_term_stay', 'Boolean', NULL),
    (gen_random_uuid(), 'shelter', 'is_charge', 'Boolean', NULL),
    (gen_random_uuid(), 'shelter', 'price', 'Integer', NULL),
    (gen_random_uuid(), 'shower', 'gender_limit', 'Enum', '["mixed","male_only","female_only"]'),
    (gen_random_uuid(), 'shower', 'has_hot_water', 'Boolean', NULL),
    (gen_random_uuid(), 'toilet', 'has_flush', 'Boolean', NULL),
    (gen_random_uuid(), 'transport', 'is_operational', 'Boolean', NULL),
    (gen_random_uuid(), 'transport', 'destination', 'String', NULL),
    (gen_random_uuid(), 'transport', 'frequency', 'String', NULL),
    (gen_random_uuid(), 'medical', 'medical_level', 'Enum', '["first_aid","clinic","hospital"]'),
    (gen_random_uuid(), 'medical', 'specialties', 'Array', '["trauma","pediatric","pharmacy","surgical","Tuina/Massage"]'),
    (gen_random_uuid(), 'medical', 'has_staff', 'Boolean', NULL),
    (gen_random_uuid(), 'medical', 'capacity_available', 'Integer', NULL),
    (gen_random_uuid(), 'medical', 'vet_available', 'Boolean', NULL),
    (gen_random_uuid(), 'power', 'power_coverage', 'Text', NULL),
    (gen_random_uuid(), 'power', 'power_stable', 'Boolean', NULL),
    (gen_random_uuid(), 'cellular', 'recover_internet', 'Boolean', NULL),
    (gen_random_uuid(), 'cellular', 'recover_phone', 'Boolean', NULL),
    (gen_random_uuid(), 'cellular', 'wifi_ssid', 'String', NULL),
    (gen_random_uuid(), 'cellular', 'signal_strength', 'Enum', '["strong","weak","unstable"]'),
    (gen_random_uuid(), 'charge', 'connector_types', 'Array', '["usb_c","lightning","ac_110v"]'),
    (gen_random_uuid(), 'charge', 'available_ports', 'Integer', NULL),
    (gen_random_uuid(), 'gas_station', 'fuel_types', 'Array', '["92","95","98","diesel"]'),
    (gen_random_uuid(), 'gas_station', 'is_open', 'Boolean', NULL),
    (gen_random_uuid(), 'gas_station', 'is_onsale', 'Boolean', NULL),
    (gen_random_uuid(), 'supply', 'supply_types', 'Array', '["food","water","medicine","daily_items","repair_tool"]'),
    (gen_random_uuid(), 'supply', 'supply_rationed', 'Boolean', NULL),
    (gen_random_uuid(), 'supply', 'supply_condition', 'Text', NULL)
    """)

    # Seed task_property_config
    op.execute("""
    INSERT INTO task_property_config (uuid, task_type, property_name, data_type, enum_options) VALUES
    (gen_random_uuid(), 'rescue', 'people_count', 'Integer', NULL),
    (gen_random_uuid(), 'rescue', 'floor_level', 'Integer', NULL),
    (gen_random_uuid(), 'rescue', 'unit_number', 'String', NULL),
    (gen_random_uuid(), 'rescue', 'hazard_note', 'String', NULL),
    (gen_random_uuid(), 'hr', 'required_skill', 'Enum', '["medical","rescue","driving","cleaning","translation","logistics","repair","firefighting","inspection"]'),
    (gen_random_uuid(), 'hr', 'vehicle_type', 'Enum', '["car","truck","motorcycle","boat","ambulance","helicopter"]'),
    (gen_random_uuid(), 'hr', 'cargo_type', 'Enum', '["people","supplies","equipment"]'),
    (gen_random_uuid(), 'hr', 'cleanup_type', 'Enum', '["mud","debris","garbage","sewage"]'),
    (gen_random_uuid(), 'hr', 'required_tool', 'Enum', '["shovel","excavator","pump","truck","chainsaw"]'),
    (gen_random_uuid(), 'supply', 'item_name', 'String', NULL)
    """)


def downgrade() -> None:
    op.drop_table('task_property_config')
    op.drop_table('station_property_config')
    op.drop_table('task_assignments')
    op.drop_table('task_properties')
    op.drop_table('ticket_tasks')
    op.drop_table('routes')
    op.drop_table('secondary_locations')
    op.drop_table('photos')

    # Restore address cols on base_geometries
    op.add_column('base_geometries', sa.Column('county', sa.String(50), nullable=True))
    op.add_column('base_geometries', sa.Column('city', sa.String(50), nullable=True))
    op.add_column('base_geometries', sa.Column('lane', sa.String(20), nullable=True))
    op.add_column('base_geometries', sa.Column('alley', sa.String(20), nullable=True))
    op.add_column('base_geometries', sa.Column('no', sa.String(20), nullable=True))
    op.add_column('base_geometries', sa.Column('floor', sa.String(20), nullable=True))
    op.add_column('base_geometries', sa.Column('room', sa.String(20), nullable=True))

    # Remove ticket columns
    op.drop_column('tickets', 'review_note')
    op.drop_column('tickets', 'verification_status')
    op.drop_column('tickets', 'visibility')
    op.drop_column('tickets', 'task_type')

    # Remove station columns
    op.drop_column('stations', 'updated_by')
    op.drop_column('stations', 'priority_score')
    op.drop_column('stations', 'is_official')
    op.drop_column('stations', 'expires_at')
    op.drop_column('stations', 'is_temporary')
    op.drop_column('stations', 'dedup_group_id')
    op.drop_column('stations', 'is_duplicate')
    op.drop_column('stations', 'confidence_score')
    op.drop_column('stations', 'verification_status')
    op.drop_column('stations', 'visibility')
    op.drop_column('stations', 'source')
    op.drop_column('stations', 'description')
    op.drop_column('stations', 'name')
    op.drop_column('stations', 'type')
    op.drop_column('stations', 'child_station_uuid')

    # Recreate old tables
    op.create_table('hr_requirements',
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['uuid'], ['tickets.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_table('supply_requirements',
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['uuid'], ['tickets.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_table('hr_task_specialties',
        sa.Column('req_uuid', sa.UUID(), nullable=False),
        sa.Column('specialty_description', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['req_uuid'], ['hr_requirements.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_table('supply_task_items',
        sa.Column('req_uuid', sa.UUID(), nullable=False),
        sa.Column('item_name', sa.String(100), nullable=False),
        sa.Column('item_description', sa.String(), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('suggestion', sa.String(), nullable=True),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['req_uuid'], ['supply_requirements.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
    op.create_table('request_photos',
        sa.Column('req_uuid', sa.UUID(), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['req_uuid'], ['tickets.uuid']),
        sa.ForeignKeyConstraint(['created_by'], ['users.uuid']),
        sa.PrimaryKeyConstraint('uuid'),
    )
