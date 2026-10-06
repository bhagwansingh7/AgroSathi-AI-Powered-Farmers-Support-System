-- AgroSathi DEVELOPMENT seed data. All accounts use the password: Password@123
-- Never use these credentials outside local development.
SET NAMES utf8mb4;
SET @pw = '$2b$10$Zk3mQ9xLp2VnR8tYw1AbCe.ZplJd6JVhpv.j0emVn1ePgLdInSbmW';

INSERT INTO users (id, role, name, email, mobile, password_hash) VALUES
 (1,'admin','Asha Verma','admin@agrosathi.dev','9000000001',@pw),
 (2,'agent','Rahul Sharma','rahul.agent@agrosathi.dev','9000000002',@pw),
 (3,'agent','Meera Patel','meera.agent@agrosathi.dev','9000000003',@pw),
 (4,'agent','Imran Khan','imran.agent@agrosathi.dev','9000000004',@pw),
 (5,'farmer','Ramesh Yadav','ramesh@agrosathi.dev','9100000001',@pw),
 (6,'farmer','Sunita Devi','sunita@agrosathi.dev','9100000002',@pw),
 (7,'farmer','Gopal Singh','gopal@agrosathi.dev','9100000003',@pw),
 (8,'farmer','Lakshmi Bai','lakshmi@agrosathi.dev','9100000004',@pw),
 (9,'farmer','Mohan Patidar','mohan@agrosathi.dev','9100000005',@pw);

INSERT INTO agent_profiles (user_id, specialization, bio, max_farmers) VALUES
 (2,'Crop Disease','Plant pathology specialist for wheat and soybean.',25),
 (3,'Irrigation & Soil','Soil health and water management advisor.',25),
 (4,'Pest Management','Integrated pest management advisor.',25);

INSERT INTO locations (district, state, country, latitude, longitude) VALUES
 ('Indore','Madhya Pradesh','India',22.7196,75.8577),
 ('Sehore','Madhya Pradesh','India',23.2000,77.0833),
 ('Ujjain','Madhya Pradesh','India',23.1765,75.7885),
 ('Nashik','Maharashtra','India',19.9975,73.7898),
 ('Ludhiana','Punjab','India',30.9010,75.8573);

INSERT INTO crop_categories (id, name, description) VALUES
 (1,'Cereals','Wheat, rice, maize and other grains'),
 (2,'Oilseeds','Soybean, mustard, groundnut'),
 (3,'Pulses','Chickpea, lentil, pigeon pea'),
 (4,'Vegetables','Tomato, onion, potato'),
 (5,'Cash crops','Cotton, sugarcane');

INSERT INTO farmer_profiles (user_id, village, district, state, country, latitude, longitude, farm_size, farm_size_unit, soil_type, irrigation_type) VALUES
 (5,'Depalpur','Indore','Madhya Pradesh','India',22.8500,75.5400,6.50,'acre','Black cotton soil','Tube well'),
 (6,'Ashta','Sehore','Madhya Pradesh','India',23.0170,76.7200,4.00,'acre','Alluvial','Canal'),
 (7,'Badnagar','Ujjain','Madhya Pradesh','India',23.0400,75.3800,10.00,'acre','Black cotton soil','Drip'),
 (8,'Sinnar','Nashik','Maharashtra','India',19.8500,73.9900,3.25,'acre','Red loam','Well'),
 (9,'Mhow','Indore','Madhya Pradesh','India',22.5500,75.7600,8.00,'acre','Black cotton soil','Sprinkler');

INSERT INTO farms (id, farmer_id, name, area, area_unit, soil_type, irrigation_type) VALUES
 (1,5,'Main field',4.00,'acre','Black cotton soil','Tube well'),
 (2,5,'River plot',2.50,'acre','Alluvial','Tube well'),
 (3,6,'Home farm',4.00,'acre','Alluvial','Canal'),
 (4,7,'North block',6.00,'acre','Black cotton soil','Drip'),
 (5,7,'South block',4.00,'acre','Black cotton soil','Drip'),
 (6,8,'Hill plot',3.25,'acre','Red loam','Well'),
 (7,9,'Main field',8.00,'acre','Black cotton soil','Sprinkler');

INSERT INTO crops (id, farmer_id, farm_id, category_id, crop_name, variety, sowing_date, expected_harvest_date, area, soil_type, irrigation_type, notes) VALUES
 (1,5,1,1,'Wheat','Sharbati','2026-11-10','2027-03-25',4.00,'Black cotton soil','Tube well','Leaves turning yellow in some patches'),
 (2,5,2,2,'Mustard','Pusa Bold','2026-10-20','2027-02-28',2.50,'Alluvial','Tube well',NULL),
 (3,6,3,1,'Wheat','HI 1544','2026-11-05','2027-03-20',4.00,'Alluvial','Canal',NULL),
 (4,7,4,2,'Soybean','JS 9560','2026-06-25','2026-10-15',6.00,'Black cotton soil','Drip','Pods maturing, harvest soon'),
 (5,7,5,3,'Chickpea','JG 14','2026-10-25','2027-02-20',4.00,'Black cotton soil','Drip',NULL),
 (6,8,6,4,'Onion','Agrifound Dark Red','2026-09-15','2027-01-10',3.25,'Red loam','Well','Watching for purple blotch'),
 (7,9,7,2,'Soybean','JS 2034','2026-06-28','2026-10-18',8.00,'Black cotton soil','Sprinkler',NULL),
 (8,9,7,1,'Wheat','Poorva','2026-11-12','2027-03-28',2.00,'Black cotton soil','Sprinkler',NULL);

INSERT INTO agent_assignments (farmer_id, agent_id, assigned_by, active_farmer_id) VALUES
 (5,2,1,5),(6,3,1,6),(7,2,1,7),(8,4,1,8);
-- farmer 9 (Mohan) is intentionally unassigned so the admin assignment flow can be demonstrated.

INSERT INTO tickets (id, farmer_id, agent_id, crop_id, subject, description, category, priority, status, resolved_at) VALUES
 (1,5,2,1,'Wheat leaves turning yellow','Leaves started turning yellow a few days after irrigation. Mostly in the lower field.','crop_disease','high','in_progress',NULL),
 (2,6,3,3,'How often should I irrigate?','Canal water is available on alternate weeks. Need an irrigation schedule for wheat.','irrigation','medium','assigned',NULL),
 (3,7,2,4,'Soybean harvest timing','Pods look mature. Rain is forecast. Should I harvest early?','harvest','urgent','waiting_for_farmer',NULL),
 (4,8,4,6,'Spots on onion leaves','Purple spots appearing on older leaves.','pest_disease','medium','resolved',NOW()),
 (5,9,NULL,7,'Need an agent for soybean field','Please assign an agent. Yield looks lower than last year.','general','high','open',NULL);

INSERT INTO ticket_messages (ticket_id, sender_id, body) VALUES
 (1,2,'Thanks for reporting. Is the yellowing on older or newer leaves? Is water standing in the field?'),
 (1,5,'Mostly older leaves. Some water stays near the low corner for a day.'),
 (3,2,'Do you have a dry window of 2-3 days? Please check the weather card and let me know moisture in the pods.'),
 (4,4,'Likely purple blotch. Remove badly affected leaves and keep foliage dry. Marking resolved, reopen if it spreads.');

INSERT INTO conversations (id, farmer_id, agent_id, last_message_at) VALUES
 (1,5,2,NOW()),(2,6,3,NOW()),(3,7,2,NOW()),(4,8,4,NOW());

INSERT INTO conversation_messages (conversation_id, sender_id, body, read_at) VALUES
 (1,5,'Namaste, my wheat leaves have started turning yellow after irrigation.',NOW()),
 (1,2,'Namaste Ramesh ji. Can you tell me how many days after sowing and how much water you gave?',NOW()),
 (1,5,'About 25 days after sowing. Full flood irrigation yesterday.',NULL),
 (2,6,'When should I give the next irrigation?',NOW()),
 (2,3,'Please share the sowing date and which stage the crop is at.',NULL),
 (3,7,'Soybean pods are ready but rain is coming.',NOW());

INSERT INTO notifications (user_id, type, title, body, link, is_read) VALUES
 (5,'agent_assigned','Agent assigned','Rahul Sharma is now your agent.','/farmer/chat',1),
 (5,'new_message','New message from your agent','Rahul Sharma replied to your question.','/farmer/chat',0),
 (6,'ticket_updated','Ticket updated','Your ticket status changed to assigned.','/farmer/tickets',0),
 (2,'new_ticket','New ticket','Wheat leaves turning yellow (high).','/agent/tickets',0),
 (2,'new_message','New message','Ramesh Yadav sent a message.','/agent/chat',0),
 (1,'unassigned_ticket','Unassigned ticket','Ticket #5 from Mohan Patidar needs an agent.','/admin/tickets',0),
 (1,'new_farmer','New farmer registered','Mohan Patidar joined AgroSathi.','/admin/farmers',1);

INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES
 (1,'assignment.create','user',5,JSON_OBJECT('agent_id',2)),
 (1,'assignment.create','user',6,JSON_OBJECT('agent_id',3)),
 (1,'assignment.create','user',7,JSON_OBJECT('agent_id',2)),
 (1,'assignment.create','user',8,JSON_OBJECT('agent_id',4));

INSERT INTO knowledge_documents (id, title, category, content, source, created_by) VALUES
 (1,'Yellowing of wheat leaves: common causes','crop_disease','Yellowing of wheat leaves (chlorosis) has several common causes. Nitrogen deficiency usually shows as uniform yellowing starting from older, lower leaves. Waterlogging or excess irrigation reduces root oxygen and can cause yellowing, especially in low patches of the field. Iron or sulphur deficiency causes yellowing of younger leaves. Rust diseases cause yellow-orange pustules that rub off on fingers. Check drainage, review the last fertilizer dose and look closely at leaf spots before deciding on treatment. Confirm with a local agriculture officer before applying chemicals.','AgroSathi starter knowledge (general guidance)',1),
 (2,'Wheat irrigation: critical growth stages','irrigation','Wheat is most sensitive to water stress at crown root initiation (about 20-25 days after sowing), tillering, jointing, flowering and grain filling (milk/dough stage). Typical irrigated wheat receives 4-6 irrigations depending on soil, season and rainfall. Avoid standing water. Light soils need more frequent but lighter irrigation than black cotton soils. Skip irrigation just before expected heavy rain.','AgroSathi starter knowledge (general guidance)',1),
 (3,'Soybean harvest maturity and rain','crop_management','Soybean is ready for harvest when about 95 percent of pods have turned brown and leaves have dropped, and seed moisture is around 13-15 percent. Harvesting wet crop raises the risk of mould and shattering losses. If heavy rain is forecast, harvest-ready fields can suffer pod sprouting and quality loss; farmers often arrange early harvest on dry days, threshing space and covered storage. Consult a local agent for field-specific decisions.','AgroSathi starter knowledge (general guidance)',1),
 (4,'Purple blotch of onion','pest_management','Purple blotch (Alternaria porri) appears as small whitish sunken spots with purple centres on leaves and flower stalks, spreading in warm, humid weather. Practices include crop rotation, avoiding overhead irrigation late in the day, balanced nitrogen, removing infected debris and following local agriculture department recommendations for fungicides.','AgroSathi starter knowledge (general guidance)',1),
 (5,'Basic fertilizer guidance for wheat','fertilizer','Fertilizer needs depend on soil test results, variety and irrigation. A soil test is the best basis for a recommendation. Wheat commonly receives nitrogen in split doses (basal and at crown root initiation / tillering), with phosphorus and potash applied at sowing based on soil status. Over-application of nitrogen can cause lodging and disease. Follow state agriculture university or Krishi Vigyan Kendra recommendations.','AgroSathi starter knowledge (general guidance)',1);
