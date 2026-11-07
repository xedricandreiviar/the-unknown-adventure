CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  insert into public.profiles (
    id, email, first_name, middle_name, last_name, sex, street, purok,
    barangay, contact_number, is_senior, is_pwd, senior_id_number,
    pwd_id_number, pwd_disability_type
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'middle_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    case when new.raw_user_meta_data->>'sex' in ('male', 'female') then new.raw_user_meta_data->>'sex' else null end,
    coalesce(new.raw_user_meta_data->>'street', ''),
    coalesce(new.raw_user_meta_data->>'purok', ''),
    coalesce(nullif(new.raw_user_meta_data->>'barangay', ''), 'Wawa'),
    coalesce(new.raw_user_meta_data->>'contact_number', ''),
    coalesce(new.raw_user_meta_data->>'is_senior', '') = 'true',
    coalesce(new.raw_user_meta_data->>'is_pwd', '') = 'true',
    nullif(new.raw_user_meta_data->>'senior_id_number', ''),
    nullif(new.raw_user_meta_data->>'pwd_id_number', ''),
    nullif(new.raw_user_meta_data->>'pwd_disability_type', '')
  );

  insert into public.user_roles (user_id, role)
  values (new.id, 'resident'::public.app_role);
  return new;
end
$function$;