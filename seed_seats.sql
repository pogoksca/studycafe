-- Cheongramjae Full Seat Layout Seeding (106 Seats)
-- Button Size: 72x72, Gap: 6px => Interval: 78px
-- Canvas Size: 1000 x 1500

DELETE FROM seats;

-- ZONE A (38 Seats: 1-38)
-- Row 1: A-01 to A-07 (All Shifted +224)
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('1', 'A-01', 1, 'A', '#5E5CE6', 444, 80), ('2', 'A-02', 2, 'A', '#5E5CE6', 522, 80), ('3', 'A-03', 3, 'A', '#5E5CE6', 600, 80), ('4', 'A-04', 4, 'A', '#5E5CE6', 678, 80), ('5', 'A-05', 5, 'A', '#5E5CE6', 756, 80), ('6', 'A-06', 6, 'A', '#5E5CE6', 834, 80), ('7', 'A-07', 7, 'A', '#5E5CE6', 912, 80);
-- Row 2: A-08 to A-14
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('8', 'A-08', 8, 'A', '#5E5CE6', 912, 158), ('9', 'A-09', 9, 'A', '#5E5CE6', 834, 158), ('10', 'A-10', 10, 'A', '#5E5CE6', 756, 158), ('11', 'A-11', 11, 'A', '#5E5CE6', 678, 158), ('12', 'A-12', 12, 'A', '#5E5CE6', 600, 158), ('13', 'A-13', 13, 'A', '#5E5CE6', 522, 158), ('14', 'A-14', 14, 'A', '#5E5CE6', 444, 158);
-- Row 3: A-15 to A-22
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('15', 'A-15', 15, 'A', '#5E5CE6', 366, 270), ('16', 'A-16', 16, 'A', '#5E5CE6', 444, 270), ('17', 'A-17', 17, 'A', '#5E5CE6', 522, 270), ('18', 'A-18', 18, 'A', '#5E5CE6', 600, 270), ('19', 'A-19', 19, 'A', '#5E5CE6', 678, 270), ('20', 'A-20', 20, 'A', '#5E5CE6', 756, 270), ('21', 'A-21', 21, 'A', '#5E5CE6', 834, 270), ('22', 'A-22', 22, 'A', '#5E5CE6', 912, 270);
-- Row 4: A-23 to A-30
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('23', 'A-23', 23, 'A', '#5E5CE6', 912, 348), ('24', 'A-24', 24, 'A', '#5E5CE6', 834, 348), ('25', 'A-25', 25, 'A', '#5E5CE6', 756, 348), ('26', 'A-26', 26, 'A', '#5E5CE6', 678, 348), ('27', 'A-27', 27, 'A', '#5E5CE6', 600, 348), ('28', 'A-28', 28, 'A', '#5E5CE6', 522, 348), ('29', 'A-29', 29, 'A', '#5E5CE6', 444, 348), ('30', 'A-30', 30, 'A', '#5E5CE6', 366, 348);
-- Row 5: A-31 to A-38
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('31', 'A-31', 31, 'A', '#5E5CE6', 366, 460), ('32', 'A-32', 32, 'A', '#5E5CE6', 444, 460), ('33', 'A-33', 33, 'A', '#5E5CE6', 522, 460), ('34', 'A-34', 34, 'A', '#5E5CE6', 600, 460), ('35', 'A-35', 35, 'A', '#5E5CE6', 678, 460), ('36', 'A-36', 36, 'A', '#5E5CE6', 756, 460), ('37', 'A-37', 37, 'A', '#5E5CE6', 834, 460), ('38', 'A-38', 38, 'A', '#5E5CE6', 912, 460);

-- ZONE B (34 Seats: B-01 to B-34)
-- Row 1: B-01, B-02
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('1', 'B-01', 39, 'B', '#30D158', 10, 600), ('2', 'B-02', 40, 'B', '#30D158', 88, 600);
-- Row 2: B-03 to B-06 (B5, B6 Align with C10, C09. B3, B4 Gap 6px)
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('3', 'B-03', 41, 'B', '#30D158', 366, 600), ('4', 'B-04', 42, 'B', '#30D158', 444, 600), ('5', 'B-05', 43, 'B', '#30D158', 522, 600), ('6', 'B-06', 44, 'B', '#30D158', 600, 600);
-- Row 3: B-07 to B-12
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('7', 'B-07', 45, 'B', '#30D158', 400, 710), ('8', 'B-08', 46, 'B', '#30D158', 322, 710), ('9', 'B-09', 47, 'B', '#30D158', 244, 710), ('10', 'B-10', 48, 'B', '#30D158', 166, 710), ('11', 'B-11', 49, 'B', '#30D158', 88, 710), ('12', 'B-12', 50, 'B', '#30D158', 10, 710);
-- Row 4: B-13 to B-16 (B15, B16 Align with B8, B7)
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('13', 'B-13', 51, 'B', '#30D158', 10, 788), ('14', 'B-14', 52, 'B', '#30D158', 88, 788), ('15', 'B-15', 53, 'B', '#30D158', 322, 788), ('16', 'B-16', 54, 'B', '#30D158', 400, 788);
-- Row 5: B-17 to B-22
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('17', 'B-17', 55, 'B', '#30D158', 400, 898), ('18', 'B-18', 56, 'B', '#30D158', 322, 898), ('19', 'B-19', 57, 'B', '#30D158', 244, 898), ('20', 'B-20', 58, 'B', '#30D158', 166, 898), ('21', 'B-21', 59, 'B', '#30D158', 88, 898), ('22', 'B-22', 60, 'B', '#30D158', 10, 898);
-- Row 6: B-23 to B-28
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('23', 'B-23', 61, 'B', '#30D158', 10, 976), ('24', 'B-24', 62, 'B', '#30D158', 88, 976), ('25', 'B-25', 63, 'B', '#30D158', 166, 976), ('26', 'B-26', 64, 'B', '#30D158', 244, 976), ('27', 'B-27', 65, 'B', '#30D158', 322, 976), ('28', 'B-28', 66, 'B', '#30D158', 400, 976);
-- Row 7: B-29 to B-34
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('29', 'B-29', 67, 'B', '#30D158', 400, 1086), ('30', 'B-30', 68, 'B', '#30D158', 322, 1086), ('31', 'B-31', 69, 'B', '#30D158', 244, 1086), ('32', 'B-32', 70, 'B', '#30D158', 166, 1086), ('33', 'B-33', 71, 'B', '#30D158', 88, 1086), ('34', 'B-34', 72, 'B', '#30D158', 10, 1086);

-- ZONE C (34 Seats: C-01 to C-34)
-- Row 1: C-01 to C-04 (Align with C08 to C05 -> 678, 756, 834, 912)
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('1', 'C-01', 73, 'C', '#0A84FF', 678, 600), ('2', 'C-02', 74, 'C', '#0A84FF', 756, 600), ('3', 'C-03', 75, 'C', '#0A84FF', 834, 600), ('4', 'C-04', 76, 'C', '#0A84FF', 912, 600);
-- Row 2: C-05 to C-10 (C10 Start @ 522 to create 30px gap from B7@420)
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('5', 'C-05', 77, 'C', '#0A84FF', 912, 710), ('6', 'C-06', 78, 'C', '#0A84FF', 834, 710), ('7', 'C-07', 79, 'C', '#0A84FF', 756, 710), ('8', 'C-08', 80, 'C', '#0A84FF', 678, 710), ('9', 'C-09', 81, 'C', '#0A84FF', 600, 710), ('10', 'C-10', 82, 'C', '#0A84FF', 522, 710);
-- Row 3: C-11 to C-16
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('11', 'C-11', 83, 'C', '#0A84FF', 522, 788), ('12', 'C-12', 84, 'C', '#0A84FF', 600, 788), ('13', 'C-13', 85, 'C', '#0A84FF', 678, 788), ('14', 'C-14', 86, 'C', '#0A84FF', 756, 788), ('15', 'C-15', 87, 'C', '#0A84FF', 834, 788), ('16', 'C-16', 88, 'C', '#0A84FF', 912, 788);
-- Row 4: C-17 to C-22
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('17', 'C-17', 89, 'C', '#0A84FF', 912, 898), ('18', 'C-18', 90, 'C', '#0A84FF', 834, 898), ('19', 'C-19', 91, 'C', '#0A84FF', 756, 898), ('20', 'C-20', 92, 'C', '#0A84FF', 678, 898), ('21', 'C-21', 93, 'C', '#0A84FF', 600, 898), ('22', 'C-22', 94, 'C', '#0A84FF', 522, 898);
-- Row 5: C-23 to C-28
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('23', 'C-23', 95, 'C', '#0A84FF', 522, 976), ('24', 'C-24', 96, 'C', '#0A84FF', 600, 976), ('25', 'C-25', 97, 'C', '#0A84FF', 678, 976), ('26', 'C-26', 98, 'C', '#0A84FF', 756, 976), ('27', 'C-27', 99, 'C', '#0A84FF', 834, 976), ('28', 'C-28', 100, 'C', '#0A84FF', 912, 976);
-- Row 6: C-29 to C-34
INSERT INTO seats (seat_number, display_number, global_number, zone_name, zone_color, pos_x, pos_y) VALUES
('29', 'C-29', 101, 'C', '#0A84FF', 912, 1086), ('30', 'C-30', 102, 'C', '#0A84FF', 834, 1086), ('31', 'C-31', 103, 'C', '#0A84FF', 756, 1086), ('32', 'C-32', 104, 'C', '#0A84FF', 678, 1086), ('33', 'C-33', 105, 'C', '#0A84FF', 600, 1086), ('34', 'C-34', 106, 'C', '#0A84FF', 522, 1086);
