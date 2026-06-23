import sys

with open('CleanerDashboard.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """    // Team member hours (same logic as RoutePlanner)
    const allTeamMemberIds = new Set<string>();
    data.teamMembersWithAddr.forEach(tm => allTeamMemberIds.add(tm.id));

    const memberHours: TeamMemberHours[] = Array.from(allTeamMemberIds).map(id => {
      const tm = cleaners.find(c => c.id === id);
      if (!tm) return null;

      const pickupIdx = stops.findIndex(s =>
        (s.type === 'pickup' && s.teamMemberId === id) ||
        (s.type === 'pickup' && s.label === `Pick up ${tm.name}`)
      );
      const dropoffIdx = stops.findIndex(s =>
        (s.type === 'dropoff' && s.teamMemberId === id) ||
        (s.type === 'dropoff' && s.label === `Drop off ${tm.name}`)
      );

      let searchStart = 0;
      let searchEnd = stops.length;
      if (pickupIdx >= 0) searchStart = pickupIdx + 1;
      if (dropoffIdx >= 0) searchEnd = dropoffIdx;

      const candidateCleans = stops.slice(searchStart, searchEnd).filter(s => s.type === 'clean');
      let relevantCleans: RouteStop[] = [];
      for (const clean of candidateCleans) {
        if (!clean.visitId) { relevantCleans.push(clean); continue; }
        const visit = data.driverVisits.find(v => v.id === clean.visitId);
        if (visit) {
          let assignedIds = visit.assignedCleanerIds || [];
          if (assignedIds.length === 0) {
            const team = teams.find(t => t.id === visit.assignedTeamId);
            if (team) assignedIds = team.cleanerIds;
          }
          if (assignedIds.includes(id)) relevantCleans.push(clean);
        }
      }

      const isMainDriver = tm.id === data.driver.id;

      if (!isMainDriver) {
        // Passenger: from arrival at first clean to departure from last clean
        if (relevantCleans.length === 0) {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: false, cleanMinutes: 0, travelMinutes: 0, waitMinutes: 0 };
        }

        const firstClean = relevantCleans[0];
        const lastClean = relevantCleans[relevantCleans.length - 1];

        const firstCleanIdx = stops.indexOf(firstClean);
        const lastCleanIdx = stops.indexOf(lastClean);

        let travelMinutes = 0;
        let travelDistanceKm = 0;
        for (let i = firstCleanIdx + 1; i <= lastCleanIdx; i++) {
          travelMinutes += stops[i].legDurationMin || 0;
          travelDistanceKm += stops[i].legDistanceKm || 0;
        }

        const cleanMinutes = relevantCleans.reduce((sum, c) => sum + (c.durationMin || 0), 0);

        const cleanStart = parse(firstClean.arrivalTime, 'HH:mm', new Date());
        const cleanEnd = parse(lastClean.departTime || lastClean.arrivalTime, 'HH:mm', new Date());
        const totalMinutes = Math.round((cleanEnd.getTime() - cleanStart.getTime()) / 60000);

        const waitMinutes = Math.max(0, totalMinutes - cleanMinutes - travelMinutes);
        const paidMinutes = cleanMinutes + travelMinutes;

        return {
          name: tm.name,
          minutes: paidMinutes,
          hours: Math.round((paidMinutes / 60) * 10) / 10,
          isDriver: false,
          cleanMinutes,
          travelMinutes,
          travelDistanceKm,
          waitMinutes
        };
      } else {
        // Main driver: door-to-door (use pre-computed driverTotalMinutes for consistency)
        const cleanMinutes = relevantCleans.reduce((sum, c) => sum + (c.durationMin || 0), 0);
        const travelMinutes = Math.max(0, driverTotalMinutes - cleanMinutes);

        return {
          name: tm.name,
          minutes: driverTotalMinutes,
          hours: Math.round((driverTotalMinutes / 60) * 10) / 10,
          isDriver: true,
          cleanMinutes,
          travelMinutes,
          waitMinutes: 0
        };
      }
    }).filter(Boolean) as TeamMemberHours[];"""

new_block = """    // Team member hours — handle multiple pickup/dropoff segments per cleaner
    const allTeamMemberIds = new Set<string>();
    data.teamMembersWithAddr.forEach(tm => allTeamMemberIds.add(tm.id));

    const memberHours: TeamMemberHours[] = Array.from(allTeamMemberIds).map(id => {
      const tm = cleaners.find(c => c.id === id);
      if (!tm) return null;

      const isMainDriver = tm.id === data.driver.id;

      if (!isMainDriver) {
        // Find all pickup and dropoff events for this cleaner (including intermediate)
        const pickupEvents = stops.filter(s =>
          (s.type === 'pickup' || s.type === 'intermediate-pickup') && s.teamMemberId === id
        );
        const dropoffEvents = stops.filter(s =>
          (s.type === 'dropoff' || s.type === 'intermediate-dropoff') && s.teamMemberId === id
        );

        let totalPaidMinutes = 0;
        let totalCleanMinutes = 0;
        let totalTravelMinutes = 0;
        let totalWaitMinutes = 0;

        for (let segIdx = 0; segIdx < pickupEvents.length; segIdx++) {
          const pickup = pickupEvents[segIdx];
          const dropoff = dropoffEvents[segIdx];
          if (!dropoff) continue;

          const pickupIdx = stops.indexOf(pickup);
          const dropoffIdx = stops.indexOf(dropoff);

          const candidateCleans = stops.slice(pickupIdx + 1, dropoffIdx).filter(s => s.type === 'clean');
          let relevantCleans: RouteStop[] = [];
          for (const clean of candidateCleans) {
            if (!clean.visitId) { relevantCleans.push(clean); continue; }
            const visit = data.driverVisits.find(v => v.id === clean.visitId);
            if (visit) {
              let assignedIds = visit.assignedCleanerIds || [];
              if (assignedIds.length === 0) {
                const team = teams.find(t => t.id === visit.assignedTeamId);
                if (team) assignedIds = team.cleanerIds;
              }
              if (assignedIds.includes(id)) relevantCleans.push(clean);
            }
          }

          if (relevantCleans.length === 0) continue;

          const firstClean = relevantCleans[0];
          const lastClean = relevantCleans[relevantCleans.length - 1];
          const firstCleanIdx = stops.indexOf(firstClean);
          const lastCleanIdx = stops.indexOf(lastClean);

          let travelMinutes = 0;
          let travelDistanceKm = 0;
          for (let i = firstCleanIdx + 1; i <= lastCleanIdx; i++) {
            travelMinutes += stops[i].legDurationMin || 0;
            travelDistanceKm += stops[i].legDistanceKm || 0;
          }

          const cleanMinutes = relevantCleans.reduce((sum, c) => sum + (c.durationMin || 0), 0);
          const cleanStart = parse(firstClean.arrivalTime, 'HH:mm', new Date());
          const cleanEnd = parse(lastClean.departTime || lastClean.arrivalTime, 'HH:mm', new Date());
          const segmentMinutes = Math.round((cleanEnd.getTime() - cleanStart.getTime()) / 60000);
          const waitMinutes = Math.max(0, segmentMinutes - cleanMinutes - travelMinutes);
          const paidMinutes = cleanMinutes + travelMinutes;

          totalPaidMinutes += paidMinutes;
          totalCleanMinutes += cleanMinutes;
          totalTravelMinutes += travelMinutes;
          totalWaitMinutes += waitMinutes;
        }

        if (totalPaidMinutes === 0) {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: false, cleanMinutes: 0, travelMinutes: 0, travelDistanceKm: 0, waitMinutes: 0 };
        }

        return {
          name: tm.name,
          minutes: totalPaidMinutes,
          hours: Math.round((totalPaidMinutes / 60) * 10) / 10,
          isDriver: false,
          cleanMinutes: totalCleanMinutes,
          travelMinutes: totalTravelMinutes,
          travelDistanceKm: totalTravelMinutes,
          waitMinutes: totalWaitMinutes
        };
      } else {
        const cleanMinutes = stops.filter(s => s.type === 'clean').reduce((sum, c) => sum + (c.durationMin || 0), 0);
        const travelMinutes = Math.max(0, driverTotalMinutes - cleanMinutes);

        return {
          name: tm.name,
          minutes: driverTotalMinutes,
          hours: Math.round((driverTotalMinutes / 60) * 10) / 10,
          isDriver: true,
          cleanMinutes,
          travelMinutes,
          waitMinutes: 0
        };
      }
    }).filter(Boolean) as TeamMemberHours[];"""

if old_block not in content:
    print('ERROR: old block not found')
    idx = content.find('// Team member hours')
    if idx >= 0:
        print('Found at index', idx)
        print(repr(content[idx:idx+200]))
    else:
        print('Not found at all')
    sys.exit(1)

content = content.replace(old_block, new_block)
with open('CleanerDashboard.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
