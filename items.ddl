/* items.ddl */

/* items */
drop table items;
create table if not exists items ( id varchar(50) not null primary key, name varchar(50) default '', description text default '', price int 0, image_url text default '', created bigint default 0, updated bigint default 0 );
